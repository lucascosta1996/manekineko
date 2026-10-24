'use client';
import { Button } from '@manekineko/ui/button';
export default function ErrorPage({retry}: {retry: ()=>void}) {
  return <section className="mirror-page"><div className="mirror-message"><h1>The gallery is taking a moment.</h1>
    <p role="alert">We couldn’t load the collection data. Please try again.</p><div><Button onClick={retry}>Try again</Button></div></div></section>;
}
