import { addDaysYmd } from './date'
import { checkTask, parseWholeAmount, type TaskMetric } from './tasks'
import type { ClassProjectTaskRow } from './class-project'

// Task templates for a group project, in the app's two languages. The
// organizer's class project form (0029) fills its rows from one, and a team
// starting its own project can pick one so its tasks are there from the start.
// daysBefore counts each task's due date back from the deadline.
// Every template passes checkClassProject (class-project.test.ts).

export const PROJECT_TEMPLATE_KEYS = [
  'presentation',
  'report',
  'poster',
  'video',
  'survey',
  'proposal',
  'literatureReview',
  'caseStudy',
] as const
export type ProjectTemplateKey = (typeof PROJECT_TEMPLATE_KEYS)[number]

type Row = { title: string; metric: TaskMetric; unit: string; target: string; daysBefore: string }
const row = (title: string, metric: TaskMetric, unit: string, target: string, daysBefore: string): Row => ({
  title,
  metric,
  unit,
  target,
  daysBefore,
})

export const PROJECT_TEMPLATES: Record<ProjectTemplateKey, Record<'ja' | 'en', ClassProjectTaskRow[]>> = {
  presentation: {
    ja: [
      row('テーマと構成を決める', 'status', '', '', '42'),
      row('調査メモ', 'characters', '', '2000', '28'),
      row('発表原稿', 'characters', '', '3000', '10'),
      row('図表づくり', 'count', '枚', '6', '7'),
      row('スライド', 'count', '枚', '15', '5'),
      row('参考文献リスト', 'status', '', '', '5'),
      row('リハーサル', 'status', '', '', '2'),
    ],
    en: [
      row('Choose the topic and outline', 'status', '', '', '42'),
      row('Research notes', 'characters', '', '2000', '28'),
      row('Talk script', 'characters', '', '3000', '10'),
      row('Charts and figures', 'count', 'figures', '6', '7'),
      row('Slides', 'count', 'slides', '15', '5'),
      row('Reference list', 'status', '', '', '5'),
      row('Rehearsal', 'status', '', '', '2'),
    ],
  },
  report: {
    ja: [
      row('テーマを決める', 'status', '', '', '35'),
      row('調査メモ', 'characters', '', '2000', '21'),
      row('構成', 'status', '', '', '14'),
      row('本文', 'characters', '', '8000', '5'),
      row('推敲と提出準備', 'status', '', '', '1'),
    ],
    en: [
      row('Choose the topic', 'status', '', '', '35'),
      row('Research notes', 'characters', '', '2000', '21'),
      row('Outline', 'status', '', '', '14'),
      row('Body text', 'characters', '', '8000', '5'),
      row('Revise and submit', 'status', '', '', '1'),
    ],
  },
  poster: {
    ja: [
      row('テーマと見出しを決める', 'status', '', '', '28'),
      row('調査メモ', 'characters', '', '1500', '18'),
      row('ポスター本文', 'characters', '', '1200', '9'),
      row('図表・写真', 'count', '点', '5', '7'),
      row('レイアウトと印刷', 'status', '', '', '3'),
      row('説明の練習', 'status', '', '', '1'),
    ],
    en: [
      row('Choose the topic and headings', 'status', '', '', '28'),
      row('Research notes', 'characters', '', '1500', '18'),
      row('Poster text', 'characters', '', '1200', '9'),
      row('Figures and photos', 'count', 'items', '5', '7'),
      row('Layout and printing', 'status', '', '', '3'),
      row('Practise the walkthrough', 'status', '', '', '1'),
    ],
  },
  video: {
    ja: [
      row('企画とテーマを決める', 'status', '', '', '35'),
      row('台本', 'characters', '', '2000', '24'),
      row('絵コンテ', 'count', 'コマ', '12', '20'),
      row('撮影', 'count', 'シーン', '8', '12'),
      row('編集', 'status', '', '', '5'),
      row('字幕とBGM', 'status', '', '', '3'),
      row('試写と書き出し', 'status', '', '', '1'),
    ],
    en: [
      row('Plan and pick the theme', 'status', '', '', '35'),
      row('Script', 'characters', '', '2000', '24'),
      row('Storyboard', 'count', 'frames', '12', '20'),
      row('Filming', 'count', 'scenes', '8', '12'),
      row('Editing', 'status', '', '', '5'),
      row('Subtitles and music', 'status', '', '', '3'),
      row('Preview and export', 'status', '', '', '1'),
    ],
  },
  survey: {
    ja: [
      row('問いと仮説を決める', 'status', '', '', '42'),
      row('質問項目', 'count', '問', '15', '35'),
      row('回答を集める', 'count', '件', '50', '21'),
      row('集計と分析', 'status', '', '', '12'),
      row('グラフ', 'count', '点', '6', '9'),
      row('結果と考察', 'characters', '', '4000', '4'),
      row('発表資料', 'count', '枚', '12', '2'),
    ],
    en: [
      row('Set the question and hypothesis', 'status', '', '', '42'),
      row('Survey questions', 'count', 'questions', '15', '35'),
      row('Collect responses', 'count', 'responses', '50', '21'),
      row('Tally and analyse', 'status', '', '', '12'),
      row('Charts', 'count', 'charts', '6', '9'),
      row('Results and discussion', 'characters', '', '4000', '4'),
      row('Presentation slides', 'count', 'slides', '12', '2'),
    ],
  },
  proposal: {
    ja: [
      row('課題を決める', 'status', '', '', '35'),
      row('市場・ユーザー調査', 'characters', '', '2500', '24'),
      row('アイデア出し', 'count', '案', '10', '20'),
      row('企画書', 'characters', '', '5000', '8'),
      row('収支・スケジュール案', 'status', '', '', '6'),
      row('ピッチ用スライド', 'count', '枚', '10', '3'),
      row('ピッチ練習', 'status', '', '', '1'),
    ],
    en: [
      row('Pick the problem', 'status', '', '', '35'),
      row('Market and user research', 'characters', '', '2500', '24'),
      row('Brainstorm ideas', 'count', 'ideas', '10', '20'),
      row('Written proposal', 'characters', '', '5000', '8'),
      row('Budget and timeline', 'status', '', '', '6'),
      row('Pitch slides', 'count', 'slides', '10', '3'),
      row('Pitch rehearsal', 'status', '', '', '1'),
    ],
  },
  literatureReview: {
    ja: [
      row('テーマと検索語を決める', 'status', '', '', '42'),
      row('文献を集める', 'count', '本', '20', '30'),
      row('文献を読む', 'count', '本', '12', '18'),
      row('要約メモ', 'characters', '', '5000', '12'),
      row('レビュー本文', 'characters', '', '8000', '4'),
      row('参考文献リスト', 'status', '', '', '2'),
    ],
    en: [
      row('Set the topic and search terms', 'status', '', '', '42'),
      row('Collect sources', 'count', 'sources', '20', '30'),
      row('Read sources', 'count', 'sources', '12', '18'),
      row('Summary notes', 'characters', '', '5000', '12'),
      row('Review text', 'characters', '', '8000', '4'),
      row('Reference list', 'status', '', '', '2'),
    ],
  },
  caseStudy: {
    ja: [
      row('事例を選ぶ', 'status', '', '', '35'),
      row('資料を集める', 'count', '件', '10', '25'),
      row('事例の分析メモ', 'characters', '', '3000', '15'),
      row('提言をまとめる', 'characters', '', '2000', '8'),
      row('発表スライド', 'count', '枚', '12', '4'),
      row('質疑応答の準備', 'status', '', '', '1'),
    ],
    en: [
      row('Choose the case', 'status', '', '', '35'),
      row('Gather materials', 'count', 'documents', '10', '25'),
      row('Case analysis notes', 'characters', '', '3000', '15'),
      row('Recommendations', 'characters', '', '2000', '8'),
      row('Presentation slides', 'count', 'slides', '12', '4'),
      row('Prepare for Q&A', 'status', '', '', '1'),
    ],
  },
}

export function isProjectTemplateKey(value: unknown): value is ProjectTemplateKey {
  return typeof value === 'string' && (PROJECT_TEMPLATE_KEYS as readonly string[]).includes(value)
}

export type TemplateTaskInsert = {
  title: string
  metric: TaskMetric
  unit: string | null
  target_amount: number | null
  due: string | null
  position: number
}

// One template as project_tasks rows for a team starting its own project:
// the same rule as 0029's trigger (due = deadline − daysBefore, never before
// today; no deadline, no due dates). Rows that fail checkTask are left out.
export function templateTasks(
  key: ProjectTemplateKey,
  locale: 'ja' | 'en',
  deadline: string | null,
  today: string
): TemplateTaskInsert[] {
  return PROJECT_TEMPLATES[key][locale].flatMap((r, i): TemplateTaskInsert[] => {
    const target = r.metric !== 'status' && r.target !== '' ? parseWholeAmount(r.target) : null
    const checked = checkTask({ title: r.title, metric: r.metric, unit: r.unit, targetAmount: target, inputMode: 'manual' })
    if (!checked.ok) return []
    let due: string | null = null
    if (deadline !== null && deadline >= today && r.daysBefore !== '') {
      const back = addDaysYmd(deadline, -Number(r.daysBefore))
      due = back < today ? today : back
    }
    return [
      {
        title: checked.value.title,
        metric: checked.value.metric,
        unit: checked.value.unit,
        target_amount: checked.value.targetAmount,
        due,
        position: i + 1,
      },
    ]
  })
}
