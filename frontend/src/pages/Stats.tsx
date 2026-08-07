import { Suspense, lazy, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, Track, UserStats } from '../api/client';
import PageHead from '../components/PageHead';

// leaflet тянется только если у пользователя есть записанные треки
const TrackMap = lazy(() => import('../components/TrackMap'));

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
    <div className="pb-resorts">
      <PageHead kicker={`${tracks.length} заездов записано`} title="Статистика катания" />
      <div className="pb-page pb-page-pad">

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
                    <Suspense fallback={<div className="loading">Загрузка карты...</div>}>
                      <TrackMap points={track.points} distance={track.distance} />
                    </Suspense>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
