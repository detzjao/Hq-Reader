import ComicCard from './ComicCard.jsx';

export default function ComicGrid({ comics }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {comics.map((comic) => <ComicCard key={comic.id} comic={comic} />)}
    </div>
  );
}
