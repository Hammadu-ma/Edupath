-- Run after 00_stub_supabase.sql + migrations, on a THROWAWAY local database only.
\set ON_ERROR_STOP on
\set S  '11111111-1111-1111-1111-111111111111'
\set S2 '22222222-2222-2222-2222-222222222222'
\set T  '33333333-3333-3333-3333-333333333333'
\set T2 '44444444-4444-4444-4444-444444444444'
\set A  '55555555-5555-5555-5555-555555555555'
\set X  '66666666-6666-6666-6666-666666666666'

reset role;
insert into auth.users (id, email, raw_user_meta_data) values
 (:'S','s@x.et','{"display_name":"Sara Student","role":"student"}'),
 (:'S2','s2@x.et','{"display_name":"Samuel Other","role":"parent"}'),
 (:'T','t@x.et','{"display_name":"Tigist Tutor","role":"tutor"}'),
 (:'T2','t2@x.et','{"display_name":"Tewodros Unverified","role":"tutor"}'),
 (:'A','a@x.et','{"display_name":"Admin Person","role":"admin"}'),
 (:'X','x@x.et','{"display_name":"Hacker","role":"admin"}');
insert into public.admins(user_id) values (:'A');   -- the ONLY way to become admin: SQL by the project owner

select '--- SIGNUP / ROLES' as section;
select test.expect_count('forged role=admin in signup metadata does not grant admin', format($q$select 1 from public.user_roles where user_id=%L and role::text='admin'$q$, :'X'), 0);
select test.expect_count('forged admin signup falls back to student', format($q$select 1 from public.user_roles where user_id=%L and role='student'$q$, :'X'), 1);
select test.expect_count('forged admin signup is not in admins table', format($q$select 1 from public.admins where user_id=%L$q$, :'X'), 0);
select test.expect_count('tutor signup creates tutor_profiles row', format($q$select 1 from public.tutor_profiles where user_id=%L and kind='tutor'$q$, :'T'), 1);
select test.expect_count('student signup creates no tutor profile', format($q$select 1 from public.tutor_profiles where user_id=%L$q$, :'S'), 0);

select '--- PROFILE / ROLE ESCALATION (as student S)' as section;
set role authenticated; select set_config('request.jwt.claim.sub', :'S', false);
select test.expect_ok('student updates own display name', format($q$update public.profiles set display_name='Sara S.' where id=%L$q$, :'S'));
select test.expect_affected('student cannot update someone else''s profile', format($q$update public.profiles set display_name='pwned' where id=%L$q$, :'T'), 0);
select test.expect_error('student cannot write a role column on profiles', format($q$update public.profiles set role='admin' where id=%L$q$, :'S'));
select test.expect_error('student cannot insert user_roles (self-grant)', format($q$insert into public.user_roles(user_id, role) values (%L,'tutor')$q$, :'S'), 'permission denied');
select test.expect_error('student cannot insert into admins', format($q$insert into public.admins(user_id) values (%L)$q$, :'S'), 'permission denied');
select test.expect_count('student cannot see admin rows', 'select 1 from public.admins', 0);
select test.expect_error('student cannot change their profile id', format($q$update public.profiles set id=gen_random_uuid() where id=%L$q$, :'S'), 'permission denied');
select test.expect_error('student cannot call admin_set_verification', format($q$select public.admin_set_verification(%L,'verified')$q$, :'T'), 'Not allowed');
select test.expect_error('student cannot call admin_list_tutors', $q$select * from public.admin_list_tutors()$q$, 'Not allowed');
select test.expect_error('student cannot create bookings directly', format($q$insert into public.bookings(student_id,tutor_id,subject,mode,starts_at,duration_minutes,ends_at,price_etb) values (%L,%L,'Math','online',now()+interval '5 days',60,now()+interval '5 days 1 hour',100)$q$, :'S', :'T'), 'permission denied');
select test.expect_error('student cannot make a notification', format($q$insert into public.notifications(user_id,type,title) values (%L,'x','y')$q$, :'S'), 'permission denied');

select '--- TUTOR PROFILE + VERIFICATION (as tutor T)' as section;
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :'T', false);
select test.expect_error('tutor cannot self-verify', format($q$update public.tutor_profiles set verification_status='verified' where user_id=%L$q$, :'T'), 'permission denied');
select test.expect_error('tutor cannot self-set searchable', format($q$update public.tutor_profiles set is_searchable=true where user_id=%L$q$, :'T'), 'permission denied');
select test.expect_error('submit blocked while profile incomplete', $q$select public.submit_for_verification()$q$, 'Complete your');
select test.expect_ok('tutor edits own profile', format($q$update public.tutor_profiles set headline='Maths made simple', bio='Ten years teaching high-school mathematics in Jimma with exam focus.', teaching_modes='{online,in_person}', subjects='{Mathematics,Physics}', grade_levels='{"Grades 9-12"}', hourly_rate_etb=450, service_area='Jimma', qualifications='BSc Mathematics, Jimma University' where user_id=%L$q$, :'T'));
select test.expect_error('invalid teaching mode rejected', format($q$update public.tutor_profiles set teaching_modes='{telepathy}' where user_id=%L$q$, :'T'), 'tutor_modes_check');
select test.expect_affected('tutor cannot edit another tutor''s profile', format($q$update public.tutor_profiles set bio='hijack' where user_id=%L$q$, :'T2'), 0);
select test.expect_ok('tutor adds availability Mon-Sun 09:00-17:00', $q$insert into public.tutor_availability(tutor_id,weekday,start_min,end_min) select auth.uid(), d, 540, 1020 from generate_series(0,6) d$q$);
select test.expect_error('overlapping availability rejected', $q$insert into public.tutor_availability(tutor_id,weekday,start_min,end_min) values (auth.uid(),1,600,720)$q$, 'conflicting key');
select test.expect_error('tutor cannot add availability for others', format($q$insert into public.tutor_availability(tutor_id,weekday,start_min,end_min) values (%L,1,60,120)$q$, :'T2'), 'row-level security');
select test.expect_ok('tutor submits for verification', $q$select public.submit_for_verification()$q$);
select test.expect_error('cannot resubmit while pending', $q$select public.submit_for_verification()$q$, 'already submitted');
reset role; set role anon; select set_config('request.jwt.claim.sub','',false);
select test.expect_count('anon sees NO tutors while pending', 'select 1 from public.public_tutors', 0);
select test.expect_count('anon cannot see unverified tutor row', 'select 1 from public.tutor_profiles', 0);
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :'T', false);
select test.expect_error('tutor cannot call admin_set_verification', format($q$select public.admin_set_verification(%L,'verified')$q$, :'T'), 'Not allowed');

select '--- ADMIN VERIFICATION' as section;
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :'A', false);
select test.expect_count('admin lists pending tutors', $q$select * from public.admin_list_tutors('pending')$q$, 1);
select test.expect_ok('admin verifies tutor', format($q$select public.admin_set_verification(%L,'verified','Credentials checked')$q$, :'T'));
reset role; set role anon; select set_config('request.jwt.claim.sub','',false);
select test.expect_count('anon now sees verified tutor in public_tutors', 'select 1 from public.public_tutors', 1);
select test.expect_count('unverified tutor T2 is still hidden', format($q$select 1 from public.public_tutors where user_id=%L$q$, :'T2'), 0);
select test.expect_count('anon can read availability of verified tutor', 'select 1 from public.tutor_availability', 7);
select test.expect_error('anon cannot read profiles', 'select * from public.profiles', 'permission denied');
select test.expect_error('anon cannot read bookings', 'select * from public.bookings', 'permission denied');
select test.expect_error('anon cannot read reviews table', 'select * from public.reviews', 'permission denied');
select test.expect_error('anon cannot read messages', 'select * from public.messages', 'permission denied');
select test.expect_error('anon cannot request a booking', format($q$select public.request_booking(%L,'Mathematics','online',now()+interval '3 days',60,null)$q$, :'T'), 'permission denied');
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :'T', false);
select test.expect_ok('verified tutor may still edit own bio', format($q$update public.tutor_profiles set bio='Updated bio that is long enough to be valid for the profile page.' where user_id=%L$q$, :'T'));
select test.expect_error('verified tutor still cannot unset verification', format($q$update public.tutor_profiles set verification_status='incomplete' where user_id=%L$q$, :'T'), 'permission denied');

select '--- BOOKING WORKFLOW' as section;
reset role;
-- helper: tomorrow+1 at HH:MM Addis time
create or replace function test.slot(hh int, mm int default 0, days int default 2) returns timestamptz language sql stable as
$$ select ((date_trunc('day', now() at time zone 'Africa/Addis_Ababa') + make_interval(days => days, hours => hh, mins => mm)) at time zone 'Africa/Addis_Ababa') $$;
grant execute on function test.slot(int,int,int) to authenticated, anon; grant usage on schema test to authenticated, anon;

set role authenticated; select set_config('request.jwt.claim.sub', :'T', false);
select test.expect_error('tutor-only account cannot request sessions', format($q$select public.request_booking(%L,'Mathematics','online',test.slot(10),60,null)$q$, :'T2'), 'Only student or parent');
select set_config('request.jwt.claim.sub', :'S', false);
select test.expect_error('cannot book unverified tutor', format($q$select public.request_booking(%L,'Mathematics','online',test.slot(10),60,null)$q$, :'T2'), 'not available for booking');
select test.expect_error('subject must be one the tutor teaches', format($q$select public.request_booking(%L,'Biology','online',test.slot(10),60,null)$q$, :'T'), 'subjects');
select test.expect_error('outside availability (20:00)', format($q$select public.request_booking(%L,'Mathematics','online',test.slot(20),60,null)$q$, :'T'), 'availability');
select test.expect_error('session may not run past availability end (16:30 x 90min)', format($q$select public.request_booking(%L,'Mathematics','online',test.slot(16,30),90,null)$q$, :'T'), 'availability');
select test.expect_error('in the past', format($q$select public.request_booking(%L,'Mathematics','online',now()-interval '1 day',60,null)$q$, :'T'), '1 hour ahead');
select test.expect_error('off-grid start time (10:15)', format($q$select public.request_booking(%L,'Mathematics','online',test.slot(10,15),60,null)$q$, :'T'), 'hour or half hour');
select test.expect_error('invalid duration', format($q$select public.request_booking(%L,'Mathematics','online',test.slot(10),45,null)$q$, :'T'), 'session length');
select test.expect_error('note too long', format($q$select public.request_booking(%L,'Mathematics','online',test.slot(10),60,repeat('x',501))$q$, :'T'), '500 characters');
select test.expect_ok('student requests booking (10:00, 60min)', format($q$select public.request_booking(%L,'mathematics','online',test.slot(10),60,'Exam prep')$q$, :'T'));
select test.expect_error('overlapping request by same student denied', format($q$select public.request_booking(%L,'Mathematics','online',test.slot(10,30),60,null)$q$, :'T'), 'no longer available');
select set_config('request.jwt.claim.sub', :'S2', false);
select test.expect_error('second learner cannot take the same slot', format($q$select public.request_booking(%L,'Mathematics','online',test.slot(10),60,null)$q$, :'T'), 'no longer available');
select test.expect_ok('second learner takes a different slot (14:00)', format($q$select public.request_booking(%L,'Physics','in_person',test.slot(14),90,null)$q$, :'T'));
select test.expect_count('busy-slot function exposes ranges only', format($q$select * from public.tutor_busy_slots(%L, now(), now()+interval '10 days')$q$, :'T'), 2);

select set_config('request.jwt.claim.sub', :'S2', false);
select test.expect_count('S2 sees only own booking', 'select 1 from public.bookings', 1);
select set_config('request.jwt.claim.sub', :'T', false);
select test.expect_count('tutor sees both requests', 'select 1 from public.bookings', 2);
select test.expect_count('tutor notified of both requests', $q$select 1 from public.notifications where type='booking_request'$q$, 2);
select set_config('request.jwt.claim.sub', :'X', false);
select test.expect_count('unrelated user sees no bookings', 'select 1 from public.bookings', 0);
select test.expect_count('unrelated user sees no booking_details', 'select 1 from public.booking_details', 0);
select test.expect_count('unrelated user sees no notifications', 'select 1 from public.notifications', 0);

reset role;
select id as bk_s from public.bookings where student_id=:'S' and status='pending' \gset
set role authenticated; select set_config('request.jwt.claim.sub', :'S', false);
select test.expect_error('student cannot accept own booking', format($q$select public.respond_booking(%L,true)$q$, :'bk_s'), 'not found');
select test.expect_error('student cannot update booking status directly', $q$update public.bookings set status='accepted'$q$, 'permission denied');
select set_config('request.jwt.claim.sub', :'T2', false);
select test.expect_error('other tutor cannot answer a request', format($q$select public.respond_booking(%L,true)$q$, :'bk_s'), 'not found');
select test.expect_error('other tutor cannot cancel a request', format($q$select public.cancel_booking(%L)$q$, :'bk_s'), 'not found');
select set_config('request.jwt.claim.sub', :'S2', false);
select test.expect_error('other learner cannot cancel a request', format($q$select public.cancel_booking(%L)$q$, :'bk_s'), 'not found');
select set_config('request.jwt.claim.sub', :'X', false);
select test.expect_error('outsider cannot cancel', format($q$select public.cancel_booking(%L)$q$, :'bk_s'), 'not found');
select test.expect_error('outsider cannot complete', format($q$select public.complete_booking(%L)$q$, :'bk_s'), 'not found');

set role authenticated; select set_config('request.jwt.claim.sub', :'T', false);
select test.expect_ok('tutor accepts S''s request', format($q$select public.respond_booking(id,true) from public.bookings where student_id=%L$q$, :'S'));
select test.expect_error('cannot accept twice', format($q$select public.respond_booking(id,true) from public.bookings where student_id=%L$q$, :'S'), 'Only pending');
select test.expect_error('cannot complete a future session', format($q$select public.complete_booking(id) from public.bookings where student_id=%L$q$, :'S'), 'once it has started');
select test.expect_ok('tutor rejects S2''s request', format($q$select public.respond_booking(id,false) from public.bookings where student_id=%L$q$, :'S2'));
select test.expect_error('rejected cannot be accepted later', format($q$select public.respond_booking(id,true) from public.bookings where student_id=%L$q$, :'S2'), 'Only pending');
select set_config('request.jwt.claim.sub', :'S2', false);
select test.expect_ok('rejected slot is free again: S2 can rebook 14:00', format($q$select public.request_booking(%L,'Physics','in_person',test.slot(14),90,null)$q$, :'T'));
select test.expect_count('S2 received rejection notification', $q$select 1 from public.notifications where type='booking_rejected'$q$, 1);
select set_config('request.jwt.claim.sub', :'S', false);
select test.expect_count('S received acceptance notification', $q$select 1 from public.notifications where type='booking_accepted'$q$, 1);

select '--- DB-LEVEL TRANSITION GUARD (even for trusted code)' as section;
reset role;
insert into public.bookings(student_id,tutor_id,subject,mode,starts_at,duration_minutes,ends_at,price_etb,status)
 values (:'S2',:'T','Physics','online', now()-interval '3 days', 60, now()-interval '3 days' + interval '1 hour', 450,'cancelled');
select test.expect_error('cancelled -> accepted blocked by trigger', $q$update public.bookings set status='accepted' where status='cancelled'$q$, 'Invalid booking status change');
select test.expect_error('booking time cannot be edited', $q$update public.bookings set starts_at=starts_at+interval '1 day' where status='cancelled'$q$, 'cannot be changed');
delete from public.bookings where status='cancelled' and starts_at < now();

select '--- CANCELLATION' as section;
set role authenticated; select set_config('request.jwt.claim.sub', :'S', false);
select test.expect_ok('student cancels accepted future booking', format($q$select public.cancel_booking(id,'Plans changed') from public.bookings where student_id=%L and status='accepted'$q$, :'S'));
select test.expect_error('cancelled booking cannot be cancelled again', format($q$select public.cancel_booking(id) from public.bookings where student_id=%L and status='cancelled'$q$, :'S'), 'no longer be cancelled');
select set_config('request.jwt.claim.sub', :'T', false);
select test.expect_count('tutor notified of cancellation', $q$select 1 from public.notifications where type='booking_cancelled'$q$, 1);
select set_config('request.jwt.claim.sub', :'S', false);
select test.expect_ok('cancelled slot becomes bookable again', format($q$select public.request_booking(%L,'Mathematics','online',test.slot(10),60,null)$q$, :'T'));

select '--- COMPLETION + REVIEWS' as section;
reset role;
insert into public.bookings(id,student_id,tutor_id,subject,mode,starts_at,duration_minutes,ends_at,price_etb,status)
 values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',:'S',:'T','Mathematics','online', now()-interval '3 hours', 60, now()-interval '2 hours', 450,'accepted'),
        ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',:'S',:'T','Physics','online', now()-interval '2 days', 60, now()-interval '2 days'+interval '1 hour', 450,'accepted');
insert into public.conversations(booking_id,student_id,tutor_id) select id, student_id, tutor_id from public.bookings where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set role authenticated; select set_config('request.jwt.claim.sub', :'S', false);
select test.expect_error('learner cannot complete sessions', $q$select public.complete_booking('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$q$, 'not found');
select test.expect_error('cannot review a non-completed booking', $q$insert into public.reviews(booking_id,student_id,tutor_id,rating) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', auth.uid(), '33333333-3333-3333-3333-333333333333', 5)$q$, 'row-level security');
select set_config('request.jwt.claim.sub', :'T', false);
select test.expect_ok('tutor completes started session', $q$select public.complete_booking('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$q$);
select test.expect_error('tutor cannot complete twice', $q$select public.complete_booking('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$q$, 'Only accepted');
select test.expect_error('tutor cannot review themselves', $q$insert into public.reviews(booking_id,student_id,tutor_id,rating) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', auth.uid(), auth.uid(), 5)$q$, 'row-level security');
select set_config('request.jwt.claim.sub', :'S2', false);
select test.expect_error('another learner cannot review someone else''s completed booking', $q$insert into public.reviews(booking_id,student_id,tutor_id,rating) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', auth.uid(), '33333333-3333-3333-3333-333333333333', 1)$q$, 'row-level security');
select test.expect_error('cannot forge review as another learner', $q$insert into public.reviews(booking_id,student_id,tutor_id,rating) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 1)$q$, 'row-level security');
select set_config('request.jwt.claim.sub', :'S', false);
select test.expect_error('rating out of range', $q$insert into public.reviews(booking_id,student_id,tutor_id,rating) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', auth.uid(), '33333333-3333-3333-3333-333333333333', 6)$q$, 'rating');
select test.expect_ok('learner reviews completed booking', $q$insert into public.reviews(booking_id,student_id,tutor_id,rating,comment) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', auth.uid(), '33333333-3333-3333-3333-333333333333', 5, 'Very clear explanations')$q$);
select test.expect_error('one review per booking', $q$insert into public.reviews(booking_id,student_id,tutor_id,rating) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', auth.uid(), '33333333-3333-3333-3333-333333333333', 4)$q$, 'duplicate key');
select test.expect_ok('learner edits own review', $q$update public.reviews set rating=4, comment='Great' where student_id=auth.uid()$q$);
select test.expect_error('learner cannot reassign review to another tutor', $q$update public.reviews set tutor_id='44444444-4444-4444-4444-444444444444' where student_id=auth.uid()$q$, 'permission denied');
select set_config('request.jwt.claim.sub', :'S2', false);
select test.expect_count('S2 cannot see S''s review in table', 'select 1 from public.reviews', 0);
select test.expect_affected('S2 cannot delete S''s review', $q$delete from public.reviews$q$, 0);
reset role; set role anon; select set_config('request.jwt.claim.sub','',false);
select test.expect_count('anon sees the review through public_reviews', 'select 1 from public.public_reviews', 1);
select test.expect_count('public review shows first name only', $q$select 1 from public.public_reviews where reviewer_first_name='Sara'$q$, 1);
select test.expect_count('tutor rating aggregate computed from real reviews', $q$select 1 from public.public_tutors where avg_rating=4.0 and review_count=1$q$, 1);
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :'A', false);
select test.expect_ok('admin can remove an inappropriate review', $q$with d as (delete from public.reviews returning 1) select * from d$q$);
select test.expect_count('review is gone', 'select 1 from public.reviews', 0);

select '--- FAVORITES' as section;
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :'S', false);
select test.expect_ok('favorite a verified tutor', format($q$insert into public.favorites(user_id,tutor_id) values (auth.uid(),%L)$q$, :'T'));
select test.expect_error('cannot favorite an unverified tutor', format($q$insert into public.favorites(user_id,tutor_id) values (auth.uid(),%L)$q$, :'T2'), 'row-level security');
select test.expect_error('cannot favorite on behalf of someone else', format($q$insert into public.favorites(user_id,tutor_id) values (%L,%L)$q$, :'S2', :'T'), 'row-level security');
select set_config('request.jwt.claim.sub', :'S2', false);
select test.expect_count('other user cannot see my favorites', 'select 1 from public.favorites', 0);
select test.expect_affected('other user cannot delete my favorites', $q$delete from public.favorites$q$, 0);
select set_config('request.jwt.claim.sub', :'S', false);
select test.expect_ok('remove favorite', $q$delete from public.favorites where user_id=auth.uid()$q$);

select '--- MESSAGING' as section;
select set_config('request.jwt.claim.sub', :'S', false);
select test.expect_count('learner sees own conversations', 'select 1 from public.my_conversations', 4);
select test.expect_ok('participant sends message', $q$insert into public.messages(conversation_id,sender_id,body) select c.id, auth.uid(), 'Hello, can we start with algebra?' from public.conversations c where c.booking_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$q$);
select test.expect_error('cannot spoof the sender', $q$insert into public.messages(conversation_id,sender_id,body) select c.id, c.tutor_id, 'spoof' from public.conversations c where c.booking_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$q$, 'row-level security');
select test.expect_error('empty message rejected', $q$insert into public.messages(conversation_id,sender_id,body) select c.id, auth.uid(), '   ' from public.conversations c where c.booking_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$q$, 'body');
select set_config('request.jwt.claim.sub', :'S2', false);
select test.expect_count('non-participant reads no messages', 'select 1 from public.messages', 0);
select test.expect_count('non-participant sees no conversations', 'select 1 from public.conversations where booking_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''', 0);
select test.expect_error('non-participant cannot post into conversation', $q$insert into public.messages(conversation_id,sender_id,body) select c.id, auth.uid(), 'intrude' from (select id from public.conversations limit 1) c$q$, 'row-level security');
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', :'X', false);
select test.expect_error('outsider cannot mark a conversation read', $q$select public.mark_conversation_read(id) from (select gen_random_uuid() id) z$q$, 'Not allowed');
select set_config('request.jwt.claim.sub', :'T', false);
select test.expect_count('tutor reads the message', 'select 1 from public.messages', 1);
select test.expect_count('tutor got a message notification', $q$select 1 from public.notifications where type='message'$q$, 1);
select test.expect_ok('tutor marks conversation read', $q$select public.mark_conversation_read(c.id) from public.conversations c where c.booking_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$q$);
select test.expect_count('unread count cleared', $q$select 1 from public.my_conversations where unread > 0$q$, 0);
select test.expect_ok('mark all notifications read', $q$select public.mark_notifications_read()$q$);
select test.expect_count('no unread notifications remain', 'select 1 from public.notifications where not is_read', 0);
select test.expect_error('cannot send into a cancelled booking''s conversation', $q$insert into public.messages(conversation_id,sender_id,body) select c.id, auth.uid(), 'hi' from public.conversations c join public.bookings b on b.id=c.booking_id where b.status='cancelled'$q$, 'row-level security');

select '--- ADMIN-ONLY ASSETS' as section;
select test.expect_error('tutor cannot read admin list', 'select * from public.admin_list_tutors()', 'Not allowed');
reset role;
select 'ALL DATABASE TESTS PASSED' as result;
