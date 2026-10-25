import './polyfills.js';
import './styles.css';
import { render } from 'preact';
import { App } from './App.jsx';

if (new URLSearchParams(location.search).get('mode') === 'tab') {
  document.body.classList.add('tab-mode');
}

render(<App />, document.getElementById('root'));
