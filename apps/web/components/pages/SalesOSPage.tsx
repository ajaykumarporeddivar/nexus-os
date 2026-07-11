'use client'

import { useState } from 'react'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'agents', label: '4 Agents' },
  { id: 'skills', label: '8 Skills' },
  { id: 'commands', label: '9 Commands' },
  { id: 'knowledge', label: 'KnowledgeOS' },
  { id: 'install', label: 'Install' },
] as const

type TabId = typeof TABS[number]['id']

const AGENTS = [
  { name: 'Sales Governor', icon: '🎯', desc: 'Orchestrates the entire pipeline. Routes leads, enforces SLAs, detects stalling, triggers interventions.', color: 'bg-violet-500/10 text-violet-500 border-violet-500/30' },
  { name: 'Prospector', icon: '🔍', desc: 'Identifies ICP-fit leads, scores intent signals, enriches with firmographic data, and queues outreach.', color: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
  { name: 'Negotiator', icon: '🤝', desc: 'Handles objections, crafts counter-offers, manages pricing discussions, and escalation paths.', color: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30' },
  { name: 'Closer', icon: '✅', desc: 'Final-stage deal management, contract generation, onboarding handoff, and post-sale follow-up.', color: 'bg-green-500/10 text-green-500 border-green-500/30' },
]

const SKILLS = [
  { name: 'pipeline-state', desc: 'CRUD operations on deals with validation and audit logging' },
  { name: 'lead-qualifier', desc: 'ICP scoring, qualification criteria, and disqualification rules' },
  { name: 'outreach-sequencer', desc: 'Multi-touch cadence generation with timing and channel routing' },
  { name: 'objection-handler', desc: 'Objection taxonomy, response templates, and escalation rules' },
  { name: 'deal-scoring', desc: 'Health scoring, win probability, and risk factor analysis' },
  { name: 'follow-up-cadence', desc: 'Automated follow-up scheduling with decay and fatigue detection' },
  { name: 'proposal-generator', desc: 'Dynamic proposal creation from templates with deal context' },
  { name: 'business-hq-installer', desc: 'Interactive setup wizard for ICP, pricing, and objection library' },
]

const COMMANDS = [
  '/sales-os:init', '/sales-os:prospect', '/sales-os:qualify', '/sales-os:outreach',
  '/sales-os:negotiate', '/sales-os:close', '/sales-os:review', '/sales-os:backup', '/sales-os:restore',
]

export default function SalesOSPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-white text-lg font-bold">S</div>
          <div>
            <h1 className="text-xl font-black text-ink">Sales OS</h1>
            <p className="text-xs text-ink3 font-mono">v2.4.0 · KnowledgeOS v2.0 · Governor-orchestrated</p>
          </div>
        </div>
        <p className="text-sm text-ink3 mt-2 max-w-2xl">
          Persistent, AI-powered sales engine for Claude Code. 4 agents, 8 skills, 9 commands. Pipeline survives across sessions.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-violet-500 text-violet-500'
                : 'border-transparent text-ink3 hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { val: '4', lbl: 'AI Agents', color: 'text-violet-500' },
              { val: '8', lbl: 'Skills', color: 'text-cyan-500' },
              { val: '9', lbl: 'Commands', color: 'text-amber-500' },
              { val: '152', lbl: 'Validation Checks', color: 'text-green-500' },
            ].map(s => (
              <div key={s.lbl} className="rounded-xl border border-border bg-paper2 p-4 text-center">
                <div className={`text-2xl font-black ${s.color}`}>{s.val}</div>
                <div className="text-[10px] text-ink3 mt-1 font-mono uppercase">{s.lbl}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-paper2 p-5">
            <h3 className="text-sm font-bold text-ink mb-3">Pipeline Stages</h3>
            <div className="flex items-center gap-2 flex-wrap">
              {['Prospect', 'Qualify', 'Engage', 'Propose', 'Negotiate', 'Close', 'Post-sale'].map((stage, i) => (
                <div key={stage} className="flex items-center gap-2">
                  <div className="px-3 py-1.5 rounded-lg border border-border bg-paper text-xs font-medium text-ink">{stage}</div>
                  {i < 6 && <span className="text-ink3 text-xs">→</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-paper2 p-5">
            <h3 className="text-sm font-bold text-ink mb-3">KnowledgeOS Schema v2.0</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {['Provenance', 'Relationships', 'Decisions', 'Confidence Decay', 'Knowledge Gaps', 'Decision Outcomes', 'Relationship Traversal', 'Audit Log'].map(f => (
                <div key={f} className="px-3 py-2 rounded-lg border border-border bg-paper text-ink3">{f}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'agents' && (
        <div className="grid gap-3">
          {AGENTS.map(a => (
            <div key={a.name} className={`rounded-xl border p-4 ${a.color}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{a.icon}</span>
                <span className="text-sm font-bold">{a.name}</span>
              </div>
              <p className="text-xs opacity-80">{a.desc}</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'skills' && (
        <div className="grid gap-2">
          {SKILLS.map(s => (
            <div key={s.name} className="rounded-xl border border-border bg-paper2 p-3 flex items-start gap-3">
              <div className="w-6 h-6 rounded bg-violet-500/10 flex items-center justify-center text-[10px] font-bold text-violet-500 flex-shrink-0 mt-0.5">SK</div>
              <div>
                <div className="text-xs font-bold text-ink font-mono">{s.name}</div>
                <div className="text-[11px] text-ink3 mt-0.5">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'commands' && (
        <div className="space-y-3">
          <p className="text-xs text-ink3">Run these in Claude Code after installing Sales OS:</p>
          <div className="rounded-xl border border-border bg-ink p-4 font-mono text-xs space-y-1.5">
            {COMMANDS.map(c => (
              <div key={c} className="text-green-400">{c}</div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'knowledge' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-paper2 p-5">
            <h3 className="text-sm font-bold text-ink mb-3">Schema v2.0 Features</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {[
                { title: 'Provenance Tracking', desc: 'Every data point has source, timestamp, confidence, and verification status' },
                { title: 'Relationship Graph', desc: 'REFERRED_BY, COMPETES_WITH, EXPANSION_OF, RELATED_TO link entities' },
                { title: 'Decision Engineering', desc: 'Record decisions with rationale, alternatives considered, and outcomes' },
                { title: 'Confidence Decay', desc: 'Scores decay over time unless refreshed by new evidence' },
                { title: 'Knowledge Gaps', desc: 'Detect missing information and trigger enrichment workflows' },
                { title: 'Relationship Traversal', desc: 'Walk the graph to find hidden connections and expansion opportunities' },
              ].map(f => (
                <div key={f.title} className="rounded-lg border border-border bg-paper p-3">
                  <div className="font-bold text-ink mb-1">{f.title}</div>
                  <div className="text-ink3">{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'install' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-paper2 p-5">
            <h3 className="text-sm font-bold text-ink mb-3">Quick Install (Claude Code)</h3>
            <div className="rounded-lg bg-ink p-3 font-mono text-xs text-green-400 space-y-1">
              <div>/plugin marketplace add sales-os/sales-os-marketplace</div>
              <div>/plugin install sales-os@sales-os-marketplace</div>
              <div>/sales-os:init</div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-paper2 p-5">
            <h3 className="text-sm font-bold text-ink mb-3">Manual Install</h3>
            <div className="rounded-lg bg-ink p-3 font-mono text-xs text-cyan-400 space-y-1">
              <div># Clone or download the Sales OS directory</div>
              <div>cd sales-os</div>
              <div># Windows:</div>
              <div>.\INSTALL.ps1</div>
              <div># macOS/Linux:</div>
              <div>chmod +x install.sh && ./install.sh</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
