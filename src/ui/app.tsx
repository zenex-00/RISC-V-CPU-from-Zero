// Application shell: top bar, lesson sidebar, pages.

import { useEffect, useState } from 'preact/hooks';
import { CATALOG } from '../lessons/catalog';
import { useRoute } from './router';
import { LessonPage } from './pages/Lesson';
import { progress, subscribe, lessonMastery } from './store';
import { HomePage } from './pages/Home';
import { SandboxPage } from './pages/Sandbox';
import { ReviewPage } from './pages/Review';
import { ProgressPage, FinalPage } from './pages/Progress';
import { practiceIds } from './exercises/ids';

export function useProgress() {
  const [, set] = useState(0);
  useEffect(() => subscribe(() => set((x) => x + 1)), []);
  return progress();
}

export function App() {
  const r = useRoute();
  // The sidebar starts closed inside lessons so the diagram gets the width.
  const wantOpen = () => window.innerWidth > 1100 && (r.page !== 'lesson' || window.innerWidth >= 1800);
  const [sideOpen, setSideOpen] = useState(wantOpen);
  useProgress();
  useEffect(() => {
    window.scrollTo(0, 0);
    setSideOpen(wantOpen());
  }, [r.page, r.lesson, r.tab]);
  useEffect(() => {
    const t = r.page === 'lesson' ? `Lesson ${r.lesson}: ${CATALOG[r.lesson].title}` : r.page === 'home' ? 'Course' : r.page[0].toUpperCase() + r.page.slice(1);
    document.title = `${t} · Build a RISC-V CPU from Zero`;
  }, [r.page, r.lesson]);
  const on = (p: string) => (r.page === p ? 'on' : '');
  return (
    <div class="app">
      <a class="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <header class="topbar">
        <button class="btn ghost menu-btn" aria-label="Lessons menu" aria-expanded={sideOpen} onClick={() => setSideOpen(!sideOpen)}>
          ☰
        </button>
        <a class="brand" href="#/">
          <span class="chip">RV32I</span>
          <span class="full">Build a RISC-V CPU from Zero</span>
        </a>
        <nav class="topnav" aria-label="Main">
          <a class={on('lesson') || on('home')} href="#/">
            Lessons
          </a>
          <a class={on('sandbox')} href="#/sandbox">
            Sandbox
          </a>
          <a class={on('review')} href="#/review">
            Review
          </a>
          <a class={on('progress') || on('final')} href="#/progress">
            Progress
          </a>
          <a href="tests.html">Tests</a>
        </nav>
      </header>
      <div class="body">
        <aside class={`sidebar${sideOpen ? '' : ' closed'}`} aria-label="Lessons">
          <div class="side-h">Lessons</div>
          {CATALOG.map((c) => {
            const m = lessonMastery(c.id, practiceIds(c.id));
            return (
              <a key={c.id} class={`lesson-link${r.page === 'lesson' && r.lesson === c.id ? ' on' : ''}`} href={`#/lesson/${c.id}/1`} aria-current={r.page === 'lesson' && r.lesson === c.id ? 'page' : undefined}>
                <span class="num">{String(c.id).padStart(2, '0')}</span>
                <span class="ttl">{c.short}</span>
                <span class="bar" aria-label={`mastery ${Math.round(m * 100)} percent`}>
                  <i style={{ width: `${Math.round(m * 100)}%` }} />
                </span>
              </a>
            );
          })}
        </aside>
        <main class="main" id="main" tabIndex={-1}>
          {r.page === 'home' && <HomePage />}
          {r.page === 'lesson' && <LessonPage id={r.lesson} step={r.step} tab={r.tab} />}
          {r.page === 'sandbox' && <SandboxPage />}
          {r.page === 'review' && <ReviewPage />}
          {r.page === 'progress' && <ProgressPage />}
          {r.page === 'final' && <FinalPage />}
        </main>
      </div>
    </div>
  );
}
