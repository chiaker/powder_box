import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Resorts from './pages/Resorts'
import ResortDetail from './pages/ResortDetail'
import Hotels from './pages/Hotels'
import HotelDetail from './pages/HotelDetail'
import Equipment from './pages/Equipment'
import EquipmentDetail from './pages/EquipmentDetail'
import EquipmentForm from './pages/EquipmentForm'
import Lessons from './pages/Lessons'
import Profile from './pages/Profile'
import Stats from './pages/Stats'
import Login from './pages/Login'
import Register from './pages/Register'
import AdminLayout from './pages/admin/AdminLayout'
import AdminResorts from './pages/admin/AdminResorts'
import AdminLessons from './pages/admin/AdminLessons'
import AdminEquipment from './pages/admin/AdminEquipment'
import AdminHotels from './pages/admin/AdminHotels'
import AdminWeatherPoints from './pages/admin/AdminWeatherPoints'
import AdminSkipasses from './pages/admin/AdminSkipasses'
import { useAuth } from './context/AuthContext'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth()
  if (loading) return <div className="page"><div className="loading">Проверка доступа...</div></div>
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { token, isAdmin, loading } = useAuth()
  if (loading) return <div className="page"><div className="loading">Проверка доступа...</div></div>
  if (!token) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="resorts" element={<Resorts />} />
        <Route path="resorts/:id" element={<ResortDetail />} />
        <Route
          path="hotels"
          element={
            <ProtectedRoute>
              <Hotels />
            </ProtectedRoute>
          }
        />
        <Route path="hotels/:id" element={<HotelDetail />} />
        <Route path="equipment" element={<Equipment />} />
        <Route path="equipment/new" element={<ProtectedRoute><EquipmentForm /></ProtectedRoute>} />
        <Route path="equipment/:id" element={<EquipmentDetail />} />
        <Route path="equipment/:id/edit" element={<ProtectedRoute><EquipmentForm /></ProtectedRoute>} />
        <Route path="lessons" element={<Lessons />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route
          path="profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="stats"
          element={
            <ProtectedRoute>
              <Stats />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route
        path="admin"
        element={
          <AdminRoute>
            <AdminLayout />
          </AdminRoute>
        }
      >
        <Route index element={<Navigate to="/admin/resorts" replace />} />
        <Route path="resorts" element={<AdminResorts />} />
        <Route path="weather-points" element={<AdminWeatherPoints />} />
        <Route path="skipasses" element={<AdminSkipasses />} />
        <Route path="lessons" element={<AdminLessons />} />
        <Route path="equipment" element={<AdminEquipment />} />
        <Route path="hotels" element={<AdminHotels />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
