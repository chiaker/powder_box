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

  if (loading) return <div className="page"><div className="loading">Загрузка статистики...</div></div>;
  if (!token) return <div className="page"><div className="empty-state"><p>Войдите, чтобы посмотреть свою статистику.</p></div></div>;

  const tiles = stats
    ? [
        { label: 'Заездов', value: String(stats.total_tracks), unit: '' },
        { label: 'Дистанция', value: stats.total_distance.toFixed(1), unit: 'км' },
        { label: 'Перепад высот', value: String(Math.round(stats.total_descent)), unit: 'м' },
        { label: 'Макс. скорость', value: String(Math.round(stats.max_speed)), unit: 'км/ч' },
      ]
    : [];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Статистика катания</h1>
        <p>Сводка по вашим записанным трекам.</p>
      </header>

      {tiles.length > 0 && (
        <div className="stats-grid">
          {tiles.map((t) => (
            <div key={t.label} className="stat-tile">
              <div className="stat-tile-label">{t.label}</div>
              <div className="stat-tile-value">
                {t.value}
                {t.unit && <span className="stat-tile-unit">{t.unit}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <section>
        <div className="pb-section-head"><h3>История заездов</h3></div>
        {tracks.length === 0 ? (
          <div className="empty-state">
            <p>У вас пока нет записанных треков. Используйте мобильное приложение для записи катания.</p>
          </div>
        ) : (
          <div className="track-list">
            {tracks.map((track) => (
              <article key={track.id} className="review-card">
                <div className="track-row">
                  <span className="track-row-date">
                    {new Date(track.started_at).toLocaleDateString('ru-RU', {
                      day: 'numeric', month: 'long', year: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                  <span className="track-row-metric"><strong>{track.distance.toFixed(1)}</strong> км</span>
                  <span className="track-row-metric"><strong>{Math.round(track.total_descent)}</strong> м спуск</span>
                  <span className="track-row-metric">макс <strong>{Math.round(track.max_speed)}</strong> км/ч</span>
                </div>

                {track.points && track.points.length > 0 && (
                  <div className="pb-rd-mapbox" style={{ height: 260, marginTop: 12 }}>
                    <MapContainer
                      bounds={track.points.map(p => [p.lat, p.lng]) as [number, number][]}
                      style={{ height: '100%', width: '100%' }}
                      scrollWheelZoom={false}
                    >
                      <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      />
                      <Polyline
                        positions={track.points.map(p => [p.lat, p.lng])}
                        color="#3d8fdd"
                        weight={4}
                        opacity={0.85}
                      >
                        <Tooltip sticky>
                          Длина: {track.distance.toFixed(2)} км
                        </Tooltip>
                      </Polyline>
                    </MapContainer>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
