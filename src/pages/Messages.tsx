import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Send } from 'lucide-react'
import { Alert, EmptyState, PageShell, Spinner } from '../components/ui'
import { useAuth } from '../lib/auth'
import { listConversations, listMessages, markConversationRead, sendMessage } from '../lib/db'
import { formatDay, formatTime, friendlyError } from '../lib/booking'
import type { Conversation, Message } from '../lib/types'

export default function Messages() {
  const { id } = useParams()
  const [convs, setConvs] = useState<Conversation[] | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => { try { setConvs(await listConversations()); setError('') } catch (e) { setError(friendlyError((e as Error).message)); setConvs(c => c ?? []) } }, [])
  useEffect(() => {
    void load()
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load() }, 15000)
    return () => clearInterval(t)
  }, [load])
  const active = convs?.find(c => c.id === id)
  return <PageShell title="Messages" subtitle="Chat with your tutor or learner about a booking.">
    {error && <Alert kind="error">{error}</Alert>}
    <div className={`chat-layout ${id ? 'has-thread' : ''}`}>
      <aside className="chat-list" aria-label="Conversations">
        {convs === null ? <Spinner /> : convs.length === 0
          ? <EmptyState title="No conversations yet">A conversation opens automatically when a booking request is made.</EmptyState>
          : <ul>{convs.map(c => <li key={c.id}><Link className={c.id === id ? 'on' : ''} to={`/messages/${c.id}`}>
            <span className="chat-name">{c.other_name}{c.unread > 0 && <span className="badge-dot inline">{c.unread}</span>}</span>
            <small>{c.subject} · {formatDay(c.starts_at)}</small></Link></li>)}</ul>}
      </aside>
      <section className="chat-thread" aria-live="polite">
        {!id ? <EmptyState title="Select a conversation" /> : convs === null ? <Spinner /> : !active ? <EmptyState title="Conversation not found" action={<Link className="text-link" to="/messages">Back to messages</Link>}>It may not exist, or you may not be a participant.</EmptyState>
          : <Thread key={active.id} conv={active} onChanged={load} />}
      </section>
    </div>
  </PageShell>
}

function Thread({ conv, onChanged }: { conv: Conversation; onChanged: () => Promise<void> }) {
  const a = useAuth()
  const nav = useNavigate()
  const [msgs, setMsgs] = useState<Message[] | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const lastCount = useRef(0)
  const closed = conv.booking_status === 'cancelled' || conv.booking_status === 'rejected'

  const refresh = useCallback(async () => {
    try {
      const m = await listMessages(conv.id)
      setMsgs(m)
      if (m.some(x => x.sender_id !== a.user?.id && !x.read_at)) { await markConversationRead(conv.id); void onChanged() }
    } catch (e) { setError(friendlyError((e as Error).message)) }
  }, [conv.id, a.user?.id, onChanged])
  useEffect(() => {
    void refresh()
    const t = setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 5000)
    return () => clearInterval(t)
  }, [refresh])
  useEffect(() => { if (msgs && msgs.length !== lastCount.current) { lastCount.current = msgs.length; endRef.current?.scrollIntoView({ block: 'end' }) } }, [msgs])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setSending(true); setError('')
    try { await sendMessage(conv.id, body); setText(''); await refresh(); void onChanged() }
    catch (err) { setError(friendlyError((err as Error).message)) }
    finally { setSending(false) }
  }
  let lastDay = ''
  return <>
    <div className="thread-head"><button className="icon-button back-mobile" aria-label="Back to conversations" onClick={() => nav('/messages')}><ArrowLeft size={18} /></button>
      <div><strong>{conv.other_name}</strong><small>{conv.subject} · <Link to="/bookings">view booking</Link></small></div></div>
    <div className="thread-body">
      {msgs === null ? <Spinner /> : msgs.length === 0 ? <p className="muted center">No messages yet. Say hello!</p>
        : msgs.map(m => { const day = formatDay(m.created_at); const showDay = day !== lastDay; lastDay = day
          return <div key={m.id}>{showDay && <p className="day-sep">{day}</p>}<div className={`bubble ${m.sender_id === a.user?.id ? 'mine' : 'theirs'}`}><p>{m.body}</p><small>{formatTime(m.created_at)}</small></div></div> })}
      <div ref={endRef} />
    </div>
    {error && <Alert kind="error">{error}</Alert>}
    {closed ? <p className="muted center small">This booking is {conv.booking_status}. Messaging is closed.</p>
      : <form className="composer" onSubmit={send}><label className="sr-only" htmlFor="msg">Message</label>
        <input id="msg" value={text} onChange={e => setText(e.target.value)} maxLength={2000} placeholder="Write a message…" autoComplete="off" />
        <button className="button primary" type="submit" disabled={sending || !text.trim()} aria-label="Send message"><Send size={16} /></button></form>}
  </>
}
