'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
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
  Download,
  Home as HomeIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

type ProcessedRow = any; // Will refine later

import { CategoryField } from '@/lib/prompt';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'home' | 'categories' | 'data' | 'results' | 'settings'>('home');
  
  // App State
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({ OpenAI: '', Anthropic: '', Google: '', DeepSeek: '' });
  const [provider, setProvider] = useState('OpenAI');
  const [model, setModel] = useState('gpt-5-mini');
  const [temperature, setTemperature] = useState<number>(1);
  const [categories, setCategories] = useState<CategoryField[]>([
    { id: '1', key: 'Sentimentalitet', values: 'Positiv, Negativ, Nøytral' }
  ]);
  const [includeReasoning, setIncludeReasoning] = useState(true);
  const [includeCharacteristics, setIncludeCharacteristics] = useState(true);
  const [dataset, setDataset] = useState<ProcessedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [textColumn, setTextColumn] = useState<string>('');
  
  const [leftMarker, setLeftMarker] = useState('<b>');
  const [rightMarker, setRightMarker] = useState('</b>');
  const [hasLoadedConfig, setHasLoadedConfig] = useState(false);

  // Load config from localStorage
  useEffect(() => {
    const savedApiKeys = localStorage.getItem('luminoner_apiKeys');
    const oldApiKey = localStorage.getItem('luminoner_apiKey');
    const savedProvider = localStorage.getItem('luminoner_provider');
    const savedModel = localStorage.getItem('luminoner_model');
    const savedTemp = localStorage.getItem('luminoner_temperature');

    if (savedApiKeys) {
      try { setApiKeys(JSON.parse(savedApiKeys)); } catch(e) {}
    } else if (oldApiKey) {
      setApiKeys(prev => ({ ...prev, [savedProvider || 'OpenAI']: oldApiKey }));
    }
    
    if (savedProvider) setProvider(savedProvider);
    if (savedModel) setModel(savedModel);
    if (savedTemp) setTemperature(parseFloat(savedTemp));
    
    setHasLoadedConfig(true);
  }, []);

  // Save config to localStorage
  useEffect(() => {
    if (!hasLoadedConfig) return;
    localStorage.setItem('luminoner_apiKeys', JSON.stringify(apiKeys));
    localStorage.setItem('luminoner_provider', provider);
    localStorage.setItem('luminoner_model', model);
    localStorage.setItem('luminoner_temperature', temperature.toString());
  }, [apiKeys, provider, model, temperature, hasLoadedConfig]);

  // Auto-detect text column
  const detectTextColumn = (data: any[]) => {
    if (!data || data.length === 0) return '';
    const keys = Object.keys(data[0]);
    const preferred = ['concordance', 'concordances', 'konkordans', 'konkordanser', 'fragment', 'text', 'context', 'tekst'];
    for (const pref of preferred) {
      const match = keys.find(k => k.toLowerCase() === pref);
      if (match) return match;
    }
    return keys[0] || ''; // Fallback to first column
  };

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
          const data = results.data as ProcessedRow[];
          setDataset(data);
          setTextColumn(detectTextColumn(data));
          setActiveTab('data'); // Bytt til data i stedet for results
        }
      });
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as ProcessedRow[];
        setDataset(data);
        setTextColumn(detectTextColumn(data));
        setActiveTab('data'); // Bytt til data i stedet for results
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
    setTextColumn('');
  };

  const exportSettings = () => {
    const config = { apiKeys, provider, model, temperature };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Legg til leverandør og modell i filnavnet
    const safeModelName = model.replace(/[^a-zA-Z0-9-]/g, '_');
    a.download = `luminoner_config_${provider}_${safeModelName}.json`;
    
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSettings = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const config = JSON.parse(evt.target?.result as string);
        if (config.apiKeys) setApiKeys(config.apiKeys);
        if (config.provider) setProvider(config.provider);
        if (config.model) setModel(config.model);
        if (config.temperature !== undefined) setTemperature(config.temperature);
      } catch (err) {
        alert("Kunne ikke lese konfigurasjonsfilen.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex font-sans">
      
      {/* Sidebar Navigation */}
      <nav className="w-64 h-screen sticky top-0 overflow-y-auto bg-white border-r border-slate-200 p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-8 px-2">
            <div className="w-8 h-8 rounded bg-brand-600 flex items-center justify-center text-white font-bold">
              L
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Luminoner 2.0</h1>
          </div>

          <div className="space-y-1">
            <NavItem 
              icon={<HomeIcon size={18} />} 
              label="Hjem" 
              active={activeTab === 'home'} 
              onClick={() => setActiveTab('home')} 
            />
            <NavItem 
              icon={<LayoutTemplate size={18} />} 
              label="Kategorier" 
              active={activeTab === 'categories'} 
              onClick={() => setActiveTab('categories')} 
            />
            <NavItem 
              icon={<Database size={18} />} 
              label="Datagrunnlag" 
              active={activeTab === 'data'} 
              onClick={() => setActiveTab('data')} 
            />
            <NavItem 
              icon={<Play size={18} />} 
              label="Analyse" 
              active={activeTab === 'results'} 
              onClick={() => setActiveTab('results')} 
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <NavItem 
              icon={<Settings size={18} />} 
              label="Innstillinger" 
              active={activeTab === 'settings'} 
              onClick={() => setActiveTab('settings')} 
            />
          </div>
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-xs text-slate-500 mb-2">API Tilkobling</p>
            <div className="flex items-center gap-2 text-sm">
              <div className={`w-2 h-2 rounded-full ${(apiKeys[provider] || '').length > 10 ? 'bg-green-500' : 'bg-red-400'}`}></div>
              <span className="text-slate-600 font-medium">
                {(apiKeys[provider] || '').length > 10 ? 'Nøkkel aktiv' : 'Mangler nøkkel'}
              </span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          <div style={{ display: activeTab === 'home' ? 'block' : 'none' }}>
            <WelcomePanel setActiveTab={setActiveTab} />
          </div>
          <div style={{ display: activeTab === 'categories' ? 'block' : 'none' }}>
            <CategoryPanel 
              categories={categories}
              setCategories={setCategories}
              includeReasoning={includeReasoning}
              setIncludeReasoning={setIncludeReasoning}
              includeCharacteristics={includeCharacteristics}
              setIncludeCharacteristics={setIncludeCharacteristics}
            />
          </div>
          <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
            <SettingsPanel 
              apiKey={apiKeys[provider] || ''} 
              setApiKey={(val: string) => setApiKeys(prev => ({ ...prev, [provider]: val }))} 
              provider={provider}
              setProvider={setProvider}
              model={model}
              setModel={setModel}
              temperature={temperature}
              setTemperature={setTemperature}
              exportSettings={exportSettings}
              importSettings={importSettings}
            />
          </div>
          <div style={{ display: activeTab === 'data' ? 'block' : 'none' }}>
            <DataPanel 
              handleFileUpload={handleFileUpload}
              dataset={dataset}
              fileName={fileName}
              clearData={clearData}
              textColumn={textColumn}
              setTextColumn={setTextColumn}
              leftMarker={leftMarker}
              setLeftMarker={setLeftMarker}
              rightMarker={rightMarker}
              setRightMarker={setRightMarker}
              setActiveTab={setActiveTab}
            />
          </div>
          <div style={{ display: activeTab === 'results' ? 'block' : 'none' }}>
            <ResultsPanel 
              dataset={dataset} 
              fileName={fileName} 
              apiKey={apiKeys[provider] || ''}
              provider={provider}
              model={model}
              temperature={temperature}
              categories={categories}
              textColumn={textColumn}
              leftMarker={leftMarker}
              rightMarker={rightMarker}
              includeReasoning={includeReasoning}
              includeCharacteristics={includeCharacteristics}
            />
          </div>
        </div>
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

function WelcomePanel({ setActiveTab }: { setActiveTab: (tab: any) => void }) {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-8 text-center max-w-2xl mx-auto">
        <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-4">Luminoner 2.0</h2>
        <p className="text-lg text-slate-500 leading-relaxed">
          Fragment-basert tolkning med store språkmodeller for digital humaniora.
        </p>
      </header>

      <div className="glass-panel rounded-3xl p-8 shadow-sm">
        <h3 className="text-2xl font-bold mb-4 text-brand-900">Hva er et luminon?</h3>
        <div className="prose prose-slate max-w-none text-slate-600 leading-relaxed">
          <p className="mb-4">
            <strong>Et luminon</strong> er en mikro-tolkning av et kort tekstfragment (typisk en konkordanslinje). 
            Istedenfor at en språkmodell fritt oppsummerer en hel tekst, instrueres den til å tolke et spesifikt, markert mål-uttrykk 
            i sin umiddelbare kontekst.
          </p>
          <p className="mb-4">
            Resultatet er ikke et fritt tekstsvar, men en strukturert post som kombinerer:
          </p>
          <ul className="list-disc pl-6 space-y-2 mb-6 text-slate-700">
            <li><strong>Top-down kategorier:</strong> Forhåndsdefinerte forskningskategorier gitt av analytikeren (f.eks. betydninger, følelser, sosiale roller).</li>
            <li><strong>Bottom-up karakteristikker:</strong> Korte, fremvoksende stikkord generert av modellen for å beskrive det som er mest fremtredende i fragmentet.</li>
            <li><strong>Begrunnelse (Justification):</strong> En kort forklaring på hvorfor modellen valgte som den gjorde, med utgangspunkt i selve beviset i teksten.</li>
          </ul>
          <p>
            Dette bygger bro mellom <em>close reading</em> (nærlesning) og <em>distant reading</em> (distanselesning), 
            ved at hver eneste forekomst tolkes <em>forut</em> for aggregeringen. Hver tolkning gjøres eksplisitt, 
            strukturert, etterprøvbar og aggregarbar over tid, sjangre og arkiver.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center font-bold text-xl mb-4">1</div>
          <h4 className="font-semibold text-slate-900 mb-2">Konfigurasjon</h4>
          <p className="text-sm text-slate-500 mb-4">Definer kategoriene du leter etter, og velg språkmodell og API-nøkkel.</p>
          <div className="w-full h-32 bg-slate-100 rounded-xl border border-slate-200 border-dashed flex items-center justify-center text-xs text-slate-400">
            [ Skjermbilde plassholder ]
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-green-50 text-green-500 rounded-full flex items-center justify-center font-bold text-xl mb-4">2</div>
          <h4 className="font-semibold text-slate-900 mb-2">Last opp data</h4>
          <p className="text-sm text-slate-500 mb-4">Last inn datafilen med tekstfragmentene du ønsker å annotere.</p>
          <div className="w-full h-32 bg-slate-100 rounded-xl border border-slate-200 border-dashed flex items-center justify-center text-xs text-slate-400">
            [ Skjermbilde plassholder ]
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-purple-50 text-purple-500 rounded-full flex items-center justify-center font-bold text-xl mb-4">3</div>
          <h4 className="font-semibold text-slate-900 mb-2">Analyser</h4>
          <p className="text-sm text-slate-500 mb-4">La språkmodellen bygge luminoner som du kan eksportere og aggregere.</p>
          <div className="w-full h-32 bg-slate-100 rounded-xl border border-slate-200 border-dashed flex items-center justify-center text-xs text-slate-400">
            [ Skjermbilde plassholder ]
          </div>
        </div>
      </div>

      <div className="text-center pt-8">
        <button 
          onClick={() => setActiveTab('categories')}
          className="bg-brand-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-brand-700 transition-colors shadow-sm"
        >
          Kom i gang
        </button>
      </div>
    </div>
  );
}

function CategoryPanel({ categories, setCategories, includeReasoning, setIncludeReasoning, includeCharacteristics, setIncludeCharacteristics }: any) {
  
  const addCategory = () => {
    setCategories([...categories, { id: Date.now().toString(), key: 'Ny kategori', values: '' }]);
  };

  const updateCategory = (id: string, field: keyof CategoryField, value: string) => {
    setCategories(categories.map((c: CategoryField) => c.id === id ? { ...c, [field]: value } : c));
  };

  const removeCategory = (id: string) => {
    setCategories(categories.filter((c: CategoryField) => c.id !== id));
  };

  const exportCategories = () => {
    const exportData = { categories, includeReasoning, includeCharacteristics };
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `luminoner_kategorier_${new Date().getTime()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCategories = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        if (Array.isArray(parsed)) {
          setCategories(parsed);
        } else if (parsed && parsed.categories && Array.isArray(parsed.categories)) {
          setCategories(parsed.categories);
          if (parsed.includeReasoning !== undefined) setIncludeReasoning(parsed.includeReasoning);
          if (parsed.includeCharacteristics !== undefined) setIncludeCharacteristics(parsed.includeCharacteristics);
        } else {
          alert("Ugyldig filformat.");
        }
      } catch (err) {
        alert("Kunne ikke lese JSON-filen.");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset
  };

  return (
    <div className="space-y-6">
      <header className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">Konfigurasjon av Target</h2>
        <p className="text-slate-500 mt-1">Definer variablene og egenskapene modellen skal se etter i teksten.</p>
      </header>

      <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500 opacity-5 rounded-full blur-2xl -mr-10 -mt-10"></div>
        
        <div className="flex justify-between items-center mb-4 relative z-10">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <LayoutTemplate size={18} className="text-brand-500" />
            Kategorier (Top-down)
          </h3>
          <div className="flex gap-2">
            <button onClick={exportCategories} className="text-xs flex items-center gap-1 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors shadow-sm">
              <Download size={14} /> Eksporter (JSON)
            </button>
            <label className="text-xs flex items-center gap-1 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors shadow-sm cursor-pointer">
              <Upload size={14} /> Importer (JSON)
              <input type="file" accept=".json" className="hidden" onChange={importCategories} />
            </label>
          </div>
        </div>
        
        <div className="space-y-4">
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
                    autoComplete="off"
                    className="font-medium text-slate-800 bg-transparent focus:outline-none w-[90%] hover:bg-slate-100 focus:bg-slate-100 px-2 py-1 -ml-2 rounded-lg transition-colors border border-transparent hover:border-slate-200 focus:border-brand-300"
                  />
                </div>
                <div>
                  <input 
                    type="text"
                    value={cat.values}
                    onChange={(e) => updateCategory(cat.id, 'values', e.target.value)}
                    placeholder="Mulige verdier (kommaseparert)"
                    autoComplete="off"
                    className="text-sm text-slate-600 bg-slate-50 px-3 py-2 rounded-lg w-full focus:outline-none focus:ring-1 ring-brand-500/30"
                  />
                </div>
                <div>
                  <input 
                    type="text"
                    value={cat.prompt_note || ''}
                    onChange={(e) => updateCategory(cat.id, 'prompt_note', e.target.value)}
                    placeholder="Ekstra instruks/prompt for dette feltet (valgfritt)"
                    autoComplete="off"
                    className="text-xs text-slate-500 w-full bg-transparent focus:outline-none italic hover:bg-slate-100 focus:bg-slate-100 px-2 py-1 -ml-2 rounded-lg transition-colors border border-transparent hover:border-slate-200 focus:border-brand-300"
                  />
                </div>
              </div>
            ))}
          </div>

          <button onClick={addCategory} className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 font-medium hover:border-brand-300 hover:text-brand-600 transition-colors flex items-center justify-center gap-2">
            + Legg til ny egenskap/kategori
          </button>
          
          <div className="pt-4 border-t border-slate-200 mt-6 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
              <input type="checkbox" checked={includeReasoning} onChange={(e) => setIncludeReasoning(e.target.checked)} className="rounded text-brand-500 focus:ring-brand-500" />
              Inkluder "Begrunnelse" felt (modellen gir inntil 15 ords forklaring pr rad)
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
              <input type="checkbox" checked={includeCharacteristics} onChange={(e) => setIncludeCharacteristics(e.target.checked)} className="rounded text-brand-500 focus:ring-brand-500" />
              Inkluder "Karakteristikker" felt (modellen gir 0-3 bunn-opp stikkord)
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({ apiKey, setApiKey, provider, setProvider, model, setModel, temperature, setTemperature, exportSettings, importSettings }: any) {
  
  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProv = e.target.value;
    setProvider(newProv);
    if (newProv === 'OpenAI') setModel('gpt-4o-mini');
    else if (newProv === 'Anthropic') setModel('claude-3-5-sonnet-20240620');
    else if (newProv === 'Google') setModel('gemini-2.5-flash');
    else if (newProv === 'DeepSeek') setModel('deepseek-chat');
  };

  return (
    <div className="space-y-6">
      <header className="mb-8 flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Tekniske Innstillinger</h2>
          <p className="text-slate-500 mt-1">Velg modell, juster parametere og legg inn API-nøkkel.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportSettings} className="text-xs flex items-center gap-1 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors shadow-sm">
            <Download size={14} /> Eksporter (JSON)
          </button>
          <label className="text-xs flex items-center gap-1 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors shadow-sm cursor-pointer">
            <Upload size={14} /> Importer (JSON)
            <input type="file" accept=".json" className="hidden" onChange={importSettings} />
          </label>
        </div>
      </header>

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
                onChange={handleProviderChange}
                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="OpenAI">OpenAI</option>
                <option value="Anthropic">Anthropic</option>
                <option value="Google">Google</option>
                <option value="DeepSeek">DeepSeek</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-wider uppercase text-slate-500 mb-1">Modell</label>
              {provider === 'OpenAI' && (
                <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20">
                  <option value="gpt-5-mini">gpt-5-mini (Anbefalt / Lav pris)</option>
                  <option value="gpt-4o-mini">gpt-4o-mini (Lav pris)</option>
                  <option value="gpt-4o">gpt-4o (Høy pris)</option>
                </select>
              )}
              {provider === 'Anthropic' && (
                <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20">
                  <option value="claude-3-5-sonnet-20240620">Claude 3.5 Sonnet (Medium pris)</option>
                  <option value="claude-3-haiku-20240307">Claude 3 Haiku (Lav pris)</option>
                </select>
              )}
              {provider === 'Google' && (
                <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20">
                  <option value="gemini-2.5-flash">gemini-2.5-flash (Anbefalt / Lav pris)</option>
                  <option value="gemini-2.5-pro">gemini-2.5-pro (Medium pris)</option>
                </select>
              )}
              {provider === 'DeepSeek' && (
                <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20">
                  <option value="deepseek-chat">deepseek-chat (V3 - Lav pris)</option>
                  <option value="deepseek-reasoner">deepseek-reasoner (R1 - Medium pris)</option>
                </select>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-wider uppercase text-slate-500 mb-1">
              Temperatur (Kreativitet: {temperature})
            </label>
            <input 
              type="range" 
              min="0" max="2" step="0.1" 
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-brand-500"
            />
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>0.0 (Fokusert)</span>
              <span>1.0 (Balansert)</span>
              <span>2.0 (Kreativ)</span>
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
            <p className={`text-xs mt-1 transition-colors ${apiKey && apiKey.length > 10 ? 'text-green-600 font-medium' : 'text-slate-500'}`}>
              {apiKey && apiKey.length > 10 
                ? `✅ Nøkkel for ${provider} er lagret i nettleseren din.` 
                : 'Nøkkelen lagres kun lokalt i nettleseren din.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DataPanel({ handleFileUpload, dataset, fileName, clearData, textColumn, setTextColumn, leftMarker, setLeftMarker, rightMarker, setRightMarker, setActiveTab }: any) {
  const columns = dataset.length > 0 ? Object.keys(dataset[0]) : [];

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
        <div className="space-y-4">
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

          <div className="glass-panel rounded-2xl p-6">
            <h3 className="text-lg font-semibold mb-4 text-slate-800">Kolonnekonfigurasjon</h3>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Hvilken kolonne inneholder teksten som skal analyseres?
                </label>
                <select 
                  value={textColumn}
                  onChange={(e) => setTextColumn(e.target.value)}
                  className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  {columns.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-2">
                  Appen har valgt den mest sannsynlige kolonnen automatisk. Du kan overstyre valget her hvis det er feil.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Hvilke markører brukes rundt målordet i teksten?
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold tracking-wider uppercase text-slate-500 mb-1">Venstre markør</label>
                    <input 
                      type="text" 
                      value={leftMarker}
                      onChange={(e) => setLeftMarker(e.target.value)}
                      autoComplete="off"
                      className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold tracking-wider uppercase text-slate-500 mb-1">Høyre markør</label>
                    <input 
                      type="text" 
                      value={rightMarker}
                      onChange={(e) => setRightMarker(e.target.value)}
                      autoComplete="off"
                      className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 font-mono text-sm"
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Målordet må være markert i teksten din slik at modellen vet nøyaktig hva den skal tolke. Default er `<b>` og `</b>`.
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end pt-4">
            <button
              onClick={() => setActiveTab('results')}
              className="px-6 py-3 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-700 hover:shadow-lg hover:shadow-brand-500/20 transition-all flex items-center gap-2"
            >
              <Play size={18} />
              Gå til Analyse
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultsPanel({ dataset, fileName, apiKey, provider, model, temperature, categories, textColumn, leftMarker, rightMarker, includeReasoning, includeCharacteristics }: any) {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<any[]>([]);
  
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [systemPromptPreview, setSystemPromptPreview] = useState('');
  const [userPromptPreview, setUserPromptPreview] = useState('');
  
  const cancelRef = useRef(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning && startTime) {
      interval = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, startTime]);

  // Generer preview av prompts (for inspeksjon før man kjører)
  useEffect(() => {
    import('@/lib/prompt').then(({ buildSystemPrompt, buildUserMessage }) => {
      setSystemPromptPreview(buildSystemPrompt(categories, leftMarker, rightMarker, includeReasoning, includeCharacteristics));
      if (dataset.length > 0) {
        // Ta opptil 3 rader som et eksempel
        const sample = dataset.slice(0, Math.min(3, dataset.length)).map((r: any, i: number) => ({ ...r, id: i+1 }));
        setUserPromptPreview(buildUserMessage(sample, textColumn));
      }
    });
  }, [categories, leftMarker, rightMarker, dataset, textColumn]);

  const startBatch = async () => {
    if (!apiKey) {
      alert("Du må legge inn API-nøkkel i Innstillinger først.");
      return;
    }

    setIsRunning(true);
    setProgress(0);
    setResults([]);
    setStartTime(Date.now());
    setElapsedSeconds(0);
    cancelRef.current = false;

    // Build the system prompt using our new lib
    const { buildSystemPrompt, buildUserMessage } = await import('@/lib/prompt');
    const systemPrompt = buildSystemPrompt(categories, leftMarker, rightMarker, includeReasoning, includeCharacteristics);

    const batchSize = 10;
    const concurrency = 3; // Antall samtidige kall mot APIet
    const allResults: any[] = [];
    
    // Del opp i batcher på forhånd
    const batches = [];
    for (let i = 0; i < dataset.length; i += batchSize) {
      batches.push(dataset.slice(i, i + batchSize).map((r: any, idx: number) => ({
        ...r,
        id: i + idx + 1 // Midlertidig ID
      })));
    }

    let processedCount = 0;
    let hasError = false;

    // Funksjon for å prosessere én enkelt batch
    const processBatch = async (batch: any[]) => {
      if (hasError) return; // Stopp hvis noe allerede har feilet fatalt

      const prompt = buildUserMessage(batch, textColumn);
      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            model,
            apiKey,
            systemPrompt,
            prompt,
            temperature
          })
        });

        const data = await response.json();
        
        if (data.error) {
          console.error("API Feil:", data.error);
          alert("Feil under kjøring: " + data.error);
          hasError = true;
          return;
        }

        const rawText = data.result || "";
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.items) {
            parsed.items.forEach((item: any) => {
              const originalRow = batch.find((r: any) => r.id === item.id);
              if (originalRow) {
                allResults.push({ ...originalRow, ...item });
              }
            });
            setResults([...allResults]); 
          }
        }
      } catch (err) {
        console.error("Batch feilet:", err);
      }

      processedCount += batch.length;
      setProgress(Math.min(100, Math.round((processedCount / dataset.length) * 100)));
    };

    // Worker pool for concurrency
    const queue = [...batches];
    const workers = Array(concurrency).fill(null).map(async () => {
      while (queue.length > 0 && !hasError && !cancelRef.current) {
        const batch = queue.shift();
        if (batch) await processBatch(batch);
      }
    });

    await Promise.all(workers);

    setIsRunning(false);
    setProgress(100);
    if (cancelRef.current) {
      alert("Prosesseringen ble avbrutt.");
    }
  };

  const exportExcel = () => {
    if (results.length === 0) return;
    
    // Legg til "_Modell" kolonne i output for sporbarhet
    const enrichedResults = results.map(row => ({
      ...row,
      _Modell: model
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(enrichedResults);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Resultater");
    
    // Legg til et ekstra ark med Metadata og System Prompt
    const metaData = [
      { Egenskap: "Dato", Verdi: new Date().toLocaleString() },
      { Egenskap: "Leverandør", Verdi: provider },
      { Egenskap: "Modell", Verdi: model },
      { Egenskap: "Temperatur", Verdi: temperature },
      { Egenskap: "Bunn-opp karakteristikker", Verdi: includeCharacteristics ? "Ja" : "Nei" },
      { Egenskap: "Begrunnelse", Verdi: includeReasoning ? "Ja" : "Nei" },
      { Egenskap: "System Prompt", Verdi: systemPromptPreview }
    ];
    const metaWorksheet = XLSX.utils.json_to_sheet(metaData);
    
    // Sett bredden på kolonnene i metadata-arket slik at prompten er lesbar
    metaWorksheet['!cols'] = [{ wch: 25 }, { wch: 100 }];
    
    XLSX.utils.book_append_sheet(workbook, metaWorksheet, "Metadata");
    
    // Legg til leverandør i filnavnet (siden modellen nå ligger i arket)
    XLSX.writeFile(workbook, `luminoner_resultater_${provider}_${new Date().getTime()}.xlsx`);
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
          <button 
            onClick={() => setShowPromptPreview(!showPromptPreview)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 shadow-sm transition-all"
          >
            <FileText size={18} />
            {showPromptPreview ? 'Skjul Prompt' : 'Vis Prompt'}
          </button>
          {results.length > 0 && (
            <button 
              onClick={exportExcel}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 shadow-sm transition-all"
            >
              <Download size={18} />
              Eksportér Excel
            </button>
          )}
          {isRunning && (
            <button 
              onClick={() => { cancelRef.current = true; }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all shadow-sm bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
            >
              Avbryt
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
      
      {showPromptPreview && (
        <div className="glass-panel rounded-2xl p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4 text-slate-800">Generert Prompt (Forhåndsvisning)</h3>
          
          <div className="mb-4">
            <h4 className="text-xs font-semibold tracking-wider uppercase text-slate-500 mb-2">System Prompt (Instruks)</h4>
            <div className="bg-slate-900 text-slate-300 p-4 rounded-xl font-mono text-xs overflow-x-auto whitespace-pre-wrap">
              {systemPromptPreview}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold tracking-wider uppercase text-slate-500 mb-2">User Message (Eksempel på data batch)</h4>
            <div className="bg-slate-900 text-slate-300 p-4 rounded-xl font-mono text-xs overflow-x-auto whitespace-pre-wrap">
              {userPromptPreview || "Laster data..."}
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-4 italic">Dette er den nøyaktige teksten som sendes til språkmodellen for å hente ut luminoner. Du kan kopiere dette og lime det inn i ChatGPT, Python (OpenAI SDK), e.l. for manuell kjøring.</p>
        </div>
      )}

      {isRunning || progress > 0 ? (
        <div className="glass-panel rounded-2xl p-6 mb-6">
          <div className="flex justify-between text-sm font-medium text-slate-700 mb-2">
            <span>Fremdrift</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden mb-3">
            <div 
              className="bg-brand-500 h-2.5 rounded-full transition-all duration-500 ease-out" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          {isRunning && elapsedSeconds > 0 && (
            <div className="text-xs text-slate-500 flex justify-between font-mono bg-slate-50 p-2 rounded-lg">
              <span>{results.length} rader fullført</span>
              <span className="text-brand-600 font-semibold">{Math.round((results.length / elapsedSeconds) * 60)} rader / min</span>
            </div>
          )}
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
