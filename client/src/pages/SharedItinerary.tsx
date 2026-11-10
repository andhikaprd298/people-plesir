import { Link, useParams } from 'react-router-dom';
import { ItineraryView, planFrom } from '../components/ItineraryView';
import { ErrorBox, Loading, useFetch, useTitle } from '../components/ui';
import type { Itinerary } from '../lib/types';

export default function SharedItinerary() {
  const { token } = useParams();
  const { data, loading, error, reload } = useFetch<{ itinerary: Itinerary }>(`/api/share/${token}`);
  useTitle(data?.itinerary.title ?? 'Itinerary dibagikan');
  if (loading) return <div className="wrap section"><Loading rows={2} height={220} /></div>;
  if (error || !data) return <div className="wrap section"><ErrorBox error={error ?? 'Itinerary tidak ditemukan'} onRetry={reload} /><p style={{ marginTop: 16 }}><Link to="/planner">Susun itinerary sendiri</Link></p></div>;
  return (
    <div className="wrap" style={{ paddingBottom: 56 }}>
      <div className="page-head">
        <p className="muted small">Itinerary yang dibagikan lewat People Plesir</p>
        <h1 style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)' }}>{data.itinerary.title}</h1>
        <p className="row"><Link className="btn btn-primary btn-sm" to="/planner">Susun itinerary sendiri</Link></p>
      </div>
      <ItineraryView it={data.itinerary} plan={planFrom(data.itinerary)} readOnly />
    </div>
  );
}
