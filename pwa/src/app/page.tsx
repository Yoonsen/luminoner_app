'use client';

import { useState, useCallback } from 'react';
import { 
  Settings, 
  Upload, 
  Play, 
  FileText,
  Key,
  LayoutTemplate,
  Database,
  Trash2,
  FileSpreadsheet,
  Plus,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

type ProcessedRow = any; // Will refine later

import { CategoryField } from '@/lib/prompt';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'config' | 'data' | 'results'>('config');
  
  // App State
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState('OpenAI');
  const [model, setModel] = useState('gpt-4o-mini');
  const [targetConcept, setTargetConcept] = useState('');
  const [categories, setCategories] = useState<CategoryField[]>([
    { id: '1', key: 'Sentimentalitet', values: 'Positiv, Negativ, Nøytral' }
  ]);
  const [dataset, setDataset] = useState<ProcessedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);

  // File Upload Handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    
    if (file.name.endsWith('.csv') || file.name.endsWith('.tsv')) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setDataset(results.data as ProcessedRow[]);
          setActiveTab('results'); // Auto-switch to results/preview
        }
      });
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        setDataset(data as ProcessedRow[]);
        setActiveTab('results');
      };
      reader.readAsBinaryString(file);
    } else {
      alert("Ugyldig filtype. Vennligst bruk CSV, TSV eller Excel.");
      setFileName(null);
    }
  };

  const clearData = () => {
    setDataset([]);
    setFileName(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex font-sans">
      
      {/* Sidebar Navigation */}
      <nav className="w-64 bg-white border-r border-slate-200 p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-8 px-2">
            <div className="w-8 h-8 rounded bg-brand-600 flex items-center justify-center text-white font-bold">
              L
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Luminoner 2.0</h1>
          </div>

          <div className="space-y-1">
            <NavItem 
              icon={<Settings size={18} />} 
              label="Konfigurasjon" 
              active={activeTab === 'config'} 
              onClick={() => setActiveTab('config')} 
            />
            <NavItem 
              icon={<Database size={18} />} 
              label="Datagrunnlag" 
              active={activeTab === 'data'} 
              onClick={() => setActiveTab('data')} 
            />
            <NavItem 
              icon={<FileText size={18} />} 
              label="Resultater" 
              active={activeTab === 'results'} 
              onClick={() => setActiveTab('results')} 
            />
          </div>
        </div>

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
          <p className="text-xs text-slate-500 mb-2">API Tilkobling</p>
          <div className="flex items-center gap-2 text-sm">
            <div className={`w-2 h-2 rounded-full ${apiKey.length > 10 ? 'bg-green-500' : 'bg-red-400'}`}></div>
            <span className="text-slate-600 font-medium">
              {apiKey.length > 10 ? 'Nøkkel aktiv' : 'Mangler nøkkel'}
            </span>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-8 overflow-y-auto">
        <motion.div 
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="max-w-4xl mx-auto"
        >
          {activeTab === 'config' && (
            <ConfigPanel 
              apiKey={apiKey} 
              setApiKey={setApiKey} 
              provider={provider}
              setProvider={setProvider}
              model={model}
              setModel={setModel}
              targetConcept={targetConcept}
              setTargetConcept={setTargetConcept}
              categories={categories}
              setCategories={setCategories}
            />
          )}
          {activeTab === 'data' && (
            <DataPanel 
              handleFileUpload={handleFileUpload}
              dataset={dataset}
              fileName={fileName}
              clearData={clearData}
            />
          )}
          {activeTab === 'results' && (
            <ResultsPanel 
              dataset={dataset} 
              fileName={fileName} 
              apiKey={apiKey}
              provider={provider}
              model={model}
              targetConcept={targetConcept}
              categories={categories}
            />
          )}
        </motion.div>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
        active 
          ? 'bg-brand-50 text-brand-600' 
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ConfigPanel({ apiKey, setApiKey, provider, setProvider, model, setModel, targetConcept, setTargetConcept, categories, setCategories }: any) {
  
  const addCategory = () => {
    setCategories([...categories, { id: Date.now().toString(), key: 'Ny kategori', values: '' }]);
  };

  const updateCategory = (id: string, field: keyof CategoryField, value: string) => {
    setCategories(categories.map((c: CategoryField) => c.id === id ? { ...c, [field]: value } : c));
  };

  const removeCategory = (id: string) => {
    setCategories(categories.filter((c: CategoryField) => c.id !== id));
  };

  return (
    <div className="space-y-6">
      <header className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">Konfigurasjon av Target</h2>
        <p className="text-slate-500 mt-1">Definer variablene modellen skal se etter.</p>
      </header>

      <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500 opacity-5 rounded-full blur-2xl -mr-10 -mt-10"></div>
        
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <LayoutTemplate size={18} className="text-brand-500" />
          Kategorier (Top-down)
        </h3>
        
        <div className="space-y-4">
          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm focus-within:ring-2 ring-brand-500/20 focus-within:border-brand-500 transition-all">
            <label className="block text-xs font-semibold tracking-wider uppercase text-slate-500 mb-1">Target Concept</label>
            <input 
              type="text"
              value={targetConcept}
              onChange={(e) => setTargetConcept(e.target.value)}
              placeholder="F.eks. 'Natur', 'Klima', 'Bjørn'..."
              className="w-full text-slate-900 font-medium bg-transparent focus:outline-none"
            />
          </div>
          
          <div className="space-y-3 mt-4">
            <label className="block text-xs font-semibold tracking-wider uppercase text-slate-500 mb-2">Dine Kategori-felt</label>
            {categories.map((cat: CategoryField) => (
              <div key={cat.id} className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col gap-3 relative group">
                <button 
                  onClick={() => removeCategory(cat.id)}
                  className="absolute top-4 right-4 text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={16} />
                </button>
                <div>
                  <input 
                    type="text"
                    value={cat.key}
                    onChange={(e) => updateCategory(cat.id, 'key', e.target.value)}
                    placeholder="Kategorinavn"
                    className="font-medium text-slate-800 bg-transparent focus:outline-none w-[90%]"
                  />
                </div>
                <div>
                  <input 
                    type="text"
                    value={cat.values}
                    onChange={(e) => updateCategory(cat.id, 'values', e.target.value)}
                    placeholder="Mulige verdier (kommaseparert)"
                    className="text-sm text-slate-600 bg-slate-50 px-3 py-2 rounded-lg w-full focus:outline-none focus:ring-1 ring-brand-500/30"
                  />
                </div>
                <div>
                  <input 
                    type="text"
                    value={cat.prompt_note || ''}
                    onChange={(e) => updateCategory(cat.id, 'prompt_note', e.target.value)}
                    placeholder="Ekstra instruks/prompt for dette feltet (valgfritt)"
                    className="text-xs text-slate-500 w-full focus:outline-none italic"
                  />
                </div>
              </div>
            ))}
          </div>

          <button onClick={addCategory} className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 font-medium hover:border-brand-300 hover:text-brand-600 transition-colors flex items-center justify-center gap-2">
            + Legg til ny egenskap/kategori
          </button>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Key size={18} className="text-brand-500" />
          Modell & API
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold tracking-wider uppercase text-slate-500 mb-1">Leverandør</label>
              <select 
                value={provider} 
                onChange={(e) => setProvider(e.target.value)}
                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="OpenAI">OpenAI</option>
                <option value="Anthropic">Anthropic</option>
                <option value="Google">Google (Gemini)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-wider uppercase text-slate-500 mb-1">Modell</label>
              <input 
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="F.eks gpt-4o-mini"
                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">API-nøkkel for valgt leverandør</label>
            <input 
              type="password" 
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              autoComplete="new-password"
              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
            />
            <p className="text-xs text-slate-500 mt-1">Nøkkelen lagres kun lokalt i nettleseren din.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DataPanel({ handleFileUpload, dataset, fileName, clearData }: any) {
  return (
    <div className="space-y-6">
      <header className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">Datagrunnlag</h2>
        <p className="text-slate-500 mt-1">Last opp filer (.csv, .xlsx, .tsv) for annotering.</p>
      </header>

      {dataset.length === 0 ? (
        <label className="border-2 border-dashed border-brand-200 rounded-2xl p-12 flex flex-col items-center justify-center text-center bg-brand-50/50 hover:bg-brand-50 transition-colors cursor-pointer group">
          <div className="w-16 h-16 bg-white shadow-sm border border-brand-100 rounded-full flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
            <Upload className="text-brand-500" size={24} />
          </div>
          <h3 className="text-lg font-semibold text-brand-900">Dra og slipp fil her</h3>
          <p className="text-sm text-brand-600/70 mt-2">eller klikk for å velge fra maskinen</p>
          <input 
            type="file" 
            accept=".csv, .tsv, .xlsx, .xls"
            onChange={handleFileUpload}
            className="hidden" 
          />
        </label>
      ) : (
        <div className="glass-panel rounded-2xl p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center text-green-600">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <h3 className="text-slate-900 font-semibold">{fileName}</h3>
              <p className="text-slate-500 text-sm">Lastet inn {dataset.length} rader</p>
            </div>
          </div>
          <button 
            onClick={clearData}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="Fjern fil"
          >
            <Trash2 size={20} />
          </button>
        </div>
      )}
    </div>
  );
}

function ResultsPanel({ dataset, fileName, apiKey, provider, model, targetConcept, categories }: any) {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<any[]>([]);

  const startBatch = async () => {
    if (!apiKey) {
      alert("Du må legge inn en API-nøkkel i konfigurasjonen først!");
      return;
    }
    
    setIsRunning(true);
    setProgress(0);
    setResults([]);

    // Build the system prompt using our new lib
    const { buildSystemPrompt, buildUserMessage } = await import('@/lib/prompt');
    const systemPrompt = buildSystemPrompt(targetConcept, categories);

    const batchSize = 10;
    const allResults: any[] = [];
    
    // Process dataset in batches
    for (let i = 0; i < dataset.length; i += batchSize) {
      const batch = dataset.slice(i, i + batchSize).map((r: any, idx: number) => ({
        ...r,
        id: i + idx + 1 // Add a temporary ID for prompt linking
      }));

      const prompt = buildUserMessage(batch);

      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            model,
            apiKey,
            systemPrompt,
            prompt
          })
        });

        const data = await response.json();
        
        if (data.error) {
          console.error("API Feil:", data.error);
          alert("Feil under kjøring: " + data.error);
          break; // Stop on API error
        }

        // Try to parse the raw text output from LLM as JSON
        const rawText = data.result || "";
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.items) {
            // Merge original row with LLM output
            parsed.items.forEach((item: any) => {
              const originalRow = batch.find((r: any) => r.id === item.id);
              if (originalRow) {
                allResults.push({ ...originalRow, ...item });
              }
            });
            setResults([...allResults]); // Trigger re-render
          }
        }
      } catch (err) {
        console.error("Batch feilet:", err);
      }

      setProgress(Math.min(100, Math.round(((i + batchSize) / dataset.length) * 100)));
    }

    setIsRunning(false);
    setProgress(100);
  };

  const exportCSV = () => {
    if (results.length === 0) return;
    const csv = Papa.unparse(results);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `luminoner_results_${new Date().getTime()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Kalkuler chart-data for første kategori (hvis vi har resultater)
  const firstCategoryKey = categories?.[0]?.key || "Sentimentalitet";
  const chartData = results.length > 0 ? Object.entries(
    results.reduce((acc, row) => {
      const val = row[firstCategoryKey] || 'Ikke angitt';
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([name, count]) => ({ name, count })) : [];

  return (
    <div className="space-y-6">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Resultater</h2>
          <p className="text-slate-500 mt-1">
            {dataset.length > 0 ? `Klar til å annotere ${dataset.length} rader fra ${fileName}.` : 'Ingen data prosessert enda.'}
          </p>
        </div>
        <div className="flex gap-3">
          {results.length > 0 && (
            <button 
              onClick={exportCSV}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 shadow-sm transition-all"
            >
              <Download size={18} />
              Eksportér CSV
            </button>
          )}
          <button 
            onClick={startBatch}
            disabled={dataset.length === 0 || isRunning}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all shadow-sm ${
              dataset.length > 0 && !isRunning
                ? 'bg-brand-600 hover:bg-brand-700 text-white shadow-brand-500/20' 
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Play size={18} fill="currentColor" />
            {isRunning ? 'Prosesserer...' : 'Start Annotering'}
          </button>
        </div>
      </header>
      
      {isRunning || progress > 0 ? (
        <div className="glass-panel rounded-2xl p-6 mb-6">
          <div className="flex justify-between text-sm font-medium text-slate-700 mb-2">
            <span>Fremdrift</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div 
              className="bg-brand-500 h-2.5 rounded-full transition-all duration-500 ease-out" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      ) : null}

      {results.length > 0 && chartData.length > 0 && (
        <div className="glass-panel rounded-2xl p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4 text-slate-800">Fordeling: {firstCategoryKey}</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {dataset.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 flex flex-col items-center justify-center text-center">
          <p className="text-slate-500">Gå til "Datagrunnlag" for å laste opp filer først.</p>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0">
                <tr>
                  {Object.keys(results[0] || dataset[0] || {}).slice(0, 8).map(key => (
                    <th key={key} className="px-6 py-3 font-semibold">{key}</th>
                  ))}
                  {Object.keys(results[0] || dataset[0] || {}).length > 8 && (
                    <th className="px-6 py-3 font-semibold text-slate-400 italic">...</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(results.length > 0 ? results : dataset).slice(0, 50).map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    {Object.values(row).slice(0, 8).map((val: any, j: number) => (
                      <td key={j} className="px-6 py-4 truncate max-w-xs">{String(val)}</td>
                    ))}
                    {Object.keys(row).length > 8 && (
                      <td className="px-6 py-4 text-slate-400">...</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 bg-slate-50 border-t border-slate-100 text-center text-xs text-slate-500">
            Viser de første 50 radene som forhåndsvisning.
          </div>
        </div>
      )}
    </div>
  );
}
