import './index.css'
import App from './App.jsx'

/**
 * The exploration with no createRoot. `.envelope-root` replaces the styling
 * that used to hang off #root, which the shell now owns.
 */
export default function Envelope() {
  return (
    <div className="envelope-root">
      <App />
    </div>
  )
}
