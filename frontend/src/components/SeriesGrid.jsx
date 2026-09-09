import SeriesCard from './SeriesCard.jsx';

export default function SeriesGrid({ series = [], onOpen }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {series.map((item) => <SeriesCard key={item.key} series={item} onOpen={onOpen} />)}
    </div>
  );
}
