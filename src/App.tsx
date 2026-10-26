import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { RequireAuth } from './components/Guards'
import Home from './pages/Home'
import TutorProfile from './pages/TutorProfile'
import Bookings from './pages/Bookings'
import Messages from './pages/Messages'
import Favorites from './pages/Favorites'
import Dashboard from './pages/Dashboard'
import Account from './pages/Account'
import Admin from './pages/Admin'
import { AuthCallback, ForgotPassword, Login, ResetPassword, SignUp } from './pages/Auth'
import { NotFound, Trust } from './pages/Static'

export default function App() {
  return <Routes>
    <Route element={<Layout />}>
      <Route index element={<Home />} />
      <Route path="tutors/:id" element={<TutorProfile />} />
      <Route path="trust" element={<Trust />} />
      <Route path="login" element={<Login />} />
      <Route path="get-started" element={<SignUp />} />
      <Route path="forgot-password" element={<ForgotPassword />} />
      <Route path="reset-password" element={<ResetPassword />} />
      <Route path="auth/callback" element={<AuthCallback />} />
      <Route path="bookings" element={<RequireAuth><Bookings /></RequireAuth>} />
      <Route path="messages" element={<RequireAuth><Messages /></RequireAuth>} />
      <Route path="messages/:id" element={<RequireAuth><Messages /></RequireAuth>} />
      <Route path="favorites" element={<RequireAuth need="learner"><Favorites /></RequireAuth>} />
      <Route path="dashboard" element={<RequireAuth need="educator"><Dashboard /></RequireAuth>} />
      <Route path="account" element={<RequireAuth><Account /></RequireAuth>} />
      <Route path="admin" element={<RequireAuth need="admin"><Admin /></RequireAuth>} />
      <Route path="*" element={<NotFound />} />
    </Route>
  </Routes>
}
