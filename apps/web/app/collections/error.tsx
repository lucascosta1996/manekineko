'use client';
import { Button } from '@manekineko/ui/button';
export default function ErrorPage({retry}: {retry: ()=>void}) {
  return <section className="mirror-page"><div className="mirror-message"><h1>We couldn’t load the gallery.</h1>
    <p role="alert">Please try again to load the collection data.</p><div><Button onClick={retry}>Try again</Button></div></div></section>;
}
