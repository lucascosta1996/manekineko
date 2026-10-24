import Link from 'next/link';
import { buttonClassName } from '@manekineko/ui/button-styles';
export default function NotFound() {
  return <section className="mirror-page"><div className="mirror-message"><h1>This gallery isn’t available.</h1>
    <p>The collection or page may not have synced yet.</p><div><Link href="/collections" className={buttonClassName({variant:'secondary'})}>All collections</Link></div></div></section>;
}
