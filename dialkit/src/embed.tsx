import { DialRoot } from 'dialkit';
import 'dialkit/styles.css';
import App from './App';
import './App.css';

/**
 * The exploration plus its dial panel, with no createRoot — so it can be
 * mounted either as a shell route or by main.tsx standalone.
 */
export default function SoccerCurve() {
  return (
    <>
      <App />
      <DialRoot position="top-right" defaultOpen theme="light" />
    </>
  );
}
