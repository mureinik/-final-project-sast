import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, ShieldAlert, Filter, ChevronDown, ShieldCheck, Info, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const severityConfig = {
  critical: { label: 'Critical', class: 'bg-destructive/10 text-destructive border-destructive/20' },
  high: { label: 'High', class: 'bg-chart-5/10 text-chart-5 border-chart-5/20' },
  medium: { label: 'Medium', class: 'bg-chart-4/10 text-chart-4 border-chart-4/20' },
  low: { label: 'Low', class: 'bg-primary/10 text-primary border-primary/20' },
};

const severityFilters = [
  { value: 'all', label: 'All' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

function VulnRow({ v }) {
  const [open, setOpen] = useState(false);
  const sev = severityConfig[v.severity] ?? severityConfig.medium;

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden bg-card">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors text-left"
        onClick={() => setOpen(!open)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{v.name_en || v.name}</span>
            <Badge className={`text-[10px] border ${sev.class}`}>{sev.label}</Badge>
            {v.category && <Badge variant="outline" className="text-[10px] text-muted-foreground">{v.category}</Badge>}
          </div>
          {v.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{v.description}</p>}
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-border/40"
          >
            <div className="p-4 space-y-4">
              {v.how_it_works && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Info className="w-3.5 h-3.5 text-chart-4" />
                    <span className="text-xs font-semibold">How it works</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{v.how_it_works}</p>
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-3">
                {v.vulnerable_code && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                      <span className="text-xs font-semibold">Vulnerable Code</span>
                    </div>
                    <pre className="bg-muted/40 rounded-lg p-3 text-[11px] font-mono overflow-x-auto border border-destructive/15 text-destructive/80">{v.vulnerable_code}</pre>
                  </div>
                )}
                {v.safe_code && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-semibold">Safe Code</span>
                    </div>
                    <pre className="bg-muted/40 rounded-lg p-3 text-[11px] font-mono overflow-x-auto border border-primary/15 text-primary/80">{v.safe_code}</pre>
                  </div>
                )}
              </div>
              {v.prevention && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-chart-4" />
                    <span className="text-xs font-semibold">Prevention</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{v.prevention}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Vulnerabilities() {
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');

  const { data: vulnerabilities = [], isLoading } = useQuery({
    queryKey: ['vulnerabilities'],
    queryFn: () => base44.entities.Vulnerability.list('-created_date'),
  });

  const filtered = vulnerabilities.filter((v) => {
    const matchSearch = !search ||
      v.name?.toLowerCase().includes(search.toLowerCase()) ||
      v.name_en?.toLowerCase().includes(search.toLowerCase()) ||
      v.description?.toLowerCase().includes(search.toLowerCase());
    const matchSeverity = severityFilter === 'all' || v.severity === severityFilter;
    return matchSearch && matchSeverity;
  });

  return (
    <div className="h-full flex flex-col px-6 py-5 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold">Vulnerabilities</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Security weaknesses researched in this project</p>
        </div>
        <Badge className="bg-destructive/10 text-destructive border border-destructive/20 gap-1">
          <ShieldAlert className="w-3 h-3" />{vulnerabilities.length} total
        </Badge>
      </div>

      {/* Filters */}
      <div className="flex gap-2 shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search vulnerabilities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-sm bg-card border-border/60"
          />
        </div>
        <div className="flex items-center gap-1">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          {severityFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setSeverityFilter(f.value)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                severityFilter === f.value
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {isLoading ? (
          [1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-25" />
            <p className="text-sm">No vulnerabilities found</p>
          </div>
        ) : (
          filtered.map((v) => <VulnRow key={v.id} v={v} />)
        )}
      </div>
    </div>
  );
}