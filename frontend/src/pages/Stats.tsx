import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, Track, UserStats } from '../api/client';
import { MapContainer, TileLayer, Polyline, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export default function Stats() {
  const { token } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const [statsData, tracksData] = await Promise.all([
          api.get<UserStats>('/stats/me'),
          api.get<Track[]>('/stats/tracks')
        ]);
        setStats(statsData);
        setTracks(tracksData);
      } catch (err) {
        console.error('Failed to load stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  if (loading) return <div className="p-8 text-center text-slate-500">Загрузка статистики...</div>;
  if (!token) return <div className="p-8 text-center text-slate-500">Войдите, чтобы посмотреть свою статистику.</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Статистика катания</h1>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center">
            <div className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-1">Заездов</div>
            <div className="text-3xl font-black text-blue-600">{stats.total_tracks}</div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center">
            <div className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-1">Дистанция</div>
            <div className="text-3xl font-black text-indigo-600">{stats.total_distance.toFixed(1)} <span className="text-lg font-bold text-slate-400">км</span></div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center">
            <div className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-1">Перепад высот</div>
            <div className="text-3xl font-black text-sky-600">{Math.round(stats.total_descent)} <span className="text-lg font-bold text-slate-400">м</span></div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center">
            <div className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-1">Макс. скорость</div>
            <div className="text-3xl font-black text-cyan-600">{Math.round(stats.max_speed)} <span className="text-lg font-bold text-slate-400">км/ч</span></div>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-4">История заездов</h2>
        {tracks.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 text-center text-slate-500">
            У вас пока нет записанных треков. Используйте мобильное приложение для записи катания!
          </div>
        ) : (
          <div className="space-y-6">
            {tracks.map((track) => (
              <div key={track.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between bg-slate-50 border-b border-slate-100">
                  <div className="font-medium text-slate-700">
                    {new Date(track.started_at).toLocaleDateString('ru-RU', { 
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </div>
                  <div className="flex gap-4 mt-3 sm:mt-0 text-sm text-slate-600">
                    <div><span className="font-bold text-slate-800">{track.distance.toFixed(1)}</span> км</div>
                    <div><span className="font-bold text-slate-800">{Math.round(track.total_descent)}</span> м спуск</div>
                    <div>Макс <span className="font-bold text-slate-800">{Math.round(track.max_speed)}</span> км/ч</div>
                  </div>
                </div>
                
                {track.points && track.points.length > 0 && (
                  <div className="h-64 w-full bg-slate-100">
                    <MapContainer 
                      bounds={track.points.map(p => [p.lat, p.lng]) as [number, number][]} 
                      className="h-full w-full"
                      scrollWheelZoom={false}
                    >
                      <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      />
                      <Polyline 
                        positions={track.points.map(p => [p.lat, p.lng])} 
                        color="#3b82f6" 
                        weight={4}
                        opacity={0.8}
                      >
                        <Tooltip sticky>
                          Длина: {track.distance.toFixed(2)} км
                        </Tooltip>
                      </Polyline>
                    </MapContainer>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}