import { render } from 'preact';
import { App } from './app';

const root = document.getElementById('app')!;
root.textContent = '';
render(<App />, root);
