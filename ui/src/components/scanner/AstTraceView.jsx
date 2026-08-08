import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, TreePine, Zap, Eye, Search, AlertTriangle, CheckCircle } from 'lucide-react';

const ACTION_CONFIG = {
  PARSE:  { color: 'text-secondary',   bg: 'bg-secondary/10',   border: 'border-secondary/20',  label: 'PARSE'  },
  WALK:   { color: 'text-chart-4',     bg: 'bg-chart-4/10',     border: 'border-chart-4/20',    label: 'WALK'   },
  VISIT:  { color: 'text-muted-foreground', bg: 'bg-muted/30',  border: 'border-border/30',     label: 'VISIT'  },
  CHECK:  { color: 'text-chart-4',     bg: 'bg-chart-4/10',     border: 'border-chart-4/20',    label: 'CHECK'  },
  FLAG:   { color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/30',label: 'FLAG'   },
  SAFE:   { color: 'text-primary',     bg: 'bg-primary/10',     border: 'border-primary/20',    label: 'SAFE'   },
};

const RESULT_CONFIG = {
  visiting:   { icon: Eye,          color: 'text-muted-foreground',  label: 'visiting'   },
  safe:       { icon: CheckCircle,  color: 'text-primary',           label: 'safe'       },
  suspicious: { icon: Search,       color: 'text-chart-4',           label: 'suspicious' },
  vulnerable: { icon: AlertTriangle,color: 'text-chart-5',           label: 'vulnerable' },
  flagged:    { icon: Zap,          color: 'text-destructive',       label: 'FLAGGED'    },
};

// indent based on action hierarchy
const INDENT = { PARSE: 0, WALK: 1, VISIT: 2, CHECK: 3, FLAG: 3, SAFE: 3 };

function StepRow({ step, index, findings, animated }) {
  const [expanded, setExpanded] = useState(false);
  const ac = ACTION_CONFIG[step.action] ?? ACTION_CONFIG.VISIT;
  const rc = RESULT_CONFIG[step.result] ?? RESULT_CONFIG.visiting;
  const ResultIcon = rc.icon;
  const isFlagged = step.result === 'flagged' || step.result === 'vulnerable';
  const finding = step.finding_id ? findings.find(f => f.ruleId === step.finding_id) : null;
  const indent = (INDENT[step.action] ?? 1) * 16;

  return (
    <motion.div
      initial={animated ? { opacity: 0, x: -8 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.2 }}
      className={`border-b border-border/20 last:border-0 ${isFlagged ? 'bg-destructive/5' : ''}`}
    >
      <button
        className="w-full flex items-start gap-2 px-3 py-2 hover:bg-muted/20 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Step number */}
        <span className="text-[10px] text-muted-foreground/40 font-mono w-5 shrink-0 mt-0.5">{step.step}</span>

        {/* Indent + connector line */}
        <div className="shrink-0 flex items-center" style={{ paddingLeft: indent }}>
          <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${ac.bg} ${ac.color} border ${ac.border}`}>
            {step.action}
          </div>
        </div>

        {/* Node type */}
        <span className="text-[11px] font-mono font-semibold text-foreground/80 shrink-0">
          {step.node_type}
        </span>

        {/* Node detail */}
        <span className="text-[11px] text-muted-foreground flex-1 truncate font-mono">
          {step.node_detail}
        </span>

        {/* Line */}
        {step.line && (
          <span className="text-[10px] text-muted-foreground/50 font-mono shrink-0">:{step.line}</span>
        )}

        {/* Result badge */}
        <div className={`flex items-center gap-0.5 shrink-0 ${rc.color}`}>
          <ResultIcon className="w-3 h-3" />
          <span className="text-[10px] font-semibold hidden sm:block">{rc.label}</span>
        </div>

        <ChevronRight className={`w-3 h-3 text-muted-foreground/40 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className={`mx-3 mb-2 rounded-lg border p-3 space-y-2 ${isFlagged ? 'bg-destructive/5 border-destructive/20' : 'bg-muted/20 border-border/30'}`}>
              {/* Reason */}
              <div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">AST Reasoning</span>
                <p className="text-xs text-foreground/80 mt-0.5 leading-relaxed font-mono">{step.reason}</p>
              </div>

              {/* Finding link */}
              {finding && (
                <div className="flex items-start gap-2 pt-1 border-t border-destructive/20">
                  <AlertTriangle className="w-3 h-3 text-destructive mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[10px] font-bold text-destructive">{finding.ruleName} — {finding.cwe}</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{finding.message}</p>
                    <p className="text-[11px] text-primary mt-1">Fix: {finding.fix}</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function AstTraceView({ astTrace, findings, code }) {
  const [filter, setFilter] = useState('all');

  if (!astTrace) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground/40">
        <div className="text-center">
          <TreePine className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Run a scan to see the AST trace</p>
        </div>
      </div>
    );
  }

  const { steps = [], summary } = astTrace;

  const filters = [
    { value: 'all',        label: 'All Steps',   count: steps.length },
    { value: 'flagged',    label: 'Flagged',      count: steps.filter(s => s.result === 'flagged' || s.result === 'vulnerable').length },
    { value: 'suspicious', label: 'Suspicious',   count: steps.filter(s => s.result === 'suspicious').length },
    { value: 'safe',       label: 'Safe',         count: steps.filter(s => s.result === 'safe').length },
  ];

  const visibleSteps = filter === 'all' ? steps : steps.filter(s => {
    if (filter === 'flagged') return s.result === 'flagged' || s.result === 'vulnerable';
    return s.result === filter;
  });

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 px-3 py-2 border-b border-border/40 bg-muted/20">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <TreePine className="w-3.5 h-3.5 text-secondary" />
            <span className="text-xs font-bold">AST Walk Trace</span>
            <span className="text-[10px] text-muted-foreground">— step-by-step node traversal</span>
          </div>
          <span className="text-[10px] text-muted-foreground">{steps.length} nodes visited</span>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {Object.entries(ACTION_CONFIG).map(([k, v]) => (
            <div key={k} className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold ${v.bg} ${v.color} ${v.border}`}>
              {k}
            </div>
          ))}
          <div className="w-px bg-border mx-1" />
          {Object.entries(RESULT_CONFIG).map(([k, v]) => {
            const Icon = v.icon;
            return (
              <div key={k} className={`flex items-center gap-0.5 text-[9px] font-semibold ${v.color}`}>
                <Icon className="w-2.5 h-2.5" />
                {v.label}
              </div>
            );
          })}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1">
          {filters.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1 ${
                filter === f.value ? 'bg-primary/15 text-primary border border-primary/25' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {f.label}
              <span className="opacity-60">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Summary banner */}
      {summary && (
        <div className="shrink-0 px-3 py-2 bg-secondary/5 border-b border-secondary/15">
          <p className="text-[11px] text-secondary/80 font-mono">{summary}</p>
        </div>
      )}

      {/* Steps list */}
      <div className="flex-1 overflow-y-auto">
        {visibleSteps.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground/40 text-xs">No steps match this filter</div>
        ) : (
          visibleSteps.map((step, i) => (
            <StepRow
              key={step.step}
              step={step}
              index={i}
              findings={findings}
              animated={true}
            />
          ))
        )}
      </div>
    </div>
  );
}