'use client';

// LOT 4 — import des contacts Bexio depuis le fichier Excel/CSV exporté.
// Sélection du fichier → aperçu + correspondance des colonnes → import avec
// bilan des lignes acceptées/ignorées/rejetées. Réimport sans doublon.

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Upload, ArrowLeft, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';

interface PreviewData {
  headers: string[];
  totalRows: number;
  sample: string[][];
  suggestedMapping: Record<string, number>;
  fields: { key: string; label: string }[];
}

interface ImportResult {
  totalRows: number;
  inserted: number;
  skipped: { row: number; reason: string }[];
  rejected: { row: number; reason: string }[];
}

export default function ClientImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [isBusy, setIsBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const callApi = async (phase: 'preview' | 'import') => {
    if (!file) return null;
    const body = new FormData();
    body.append('file', file);
    body.append('phase', phase);
    if (phase === 'import') body.append('mapping', JSON.stringify(mapping));
    const response = await fetch('/api/clients/import', { method: 'POST', body });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erreur serveur');
    return data;
  };

  const handlePreview = async () => {
    setIsBusy(true);
    setResult(null);
    try {
      const data = (await callApi('preview')) as PreviewData;
      setPreview(data);
      setMapping(data.suggestedMapping);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Aperçu impossible');
    } finally {
      setIsBusy(false);
    }
  };

  const handleImport = async () => {
    setIsBusy(true);
    try {
      const data = (await callApi('import')) as ImportResult;
      setResult(data);
      toast.success(`${data.inserted} contact(s) importé(s)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import impossible');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/clients" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="w-4 h-4" /> Retour aux clients
        </Link>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Upload className="w-6 h-6 text-blue-600" />
          Import de contacts Bexio
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Fichier Excel (.xlsx) ou CSV exporté depuis Bexio. Aucune connexion à Bexio ; aucun contact existant n&apos;est écrasé ; le réimport du même fichier ne crée pas de doublons.
        </p>
      </div>

      {/* Étape 1 : fichier */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <p className="text-sm font-semibold text-gray-900">1. Fichier exporté</p>
        <input
          type="file"
          accept=".xlsx,.csv"
          onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); setResult(null); }}
          className="block text-sm text-gray-600 file:mr-3 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white file:bg-blue-600 file:border-0 file:rounded-lg hover:file:bg-blue-700"
        />
        <button
          onClick={handlePreview}
          disabled={!file || isBusy}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
        >
          {isBusy && !preview ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Analyser le fichier
        </button>
      </div>

      {/* Étape 2 : correspondance des colonnes + aperçu */}
      {preview && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-900">
            2. Correspondance des colonnes — {preview.totalRows} ligne(s) détectée(s)
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {preview.fields.map((field) => (
              <div key={field.key}>
                <label className="block text-xs text-gray-500 mb-1">{field.label}</label>
                <select
                  value={mapping[field.key] ?? -1}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setMapping((prev) => {
                      const next = { ...prev };
                      if (value < 0) delete next[field.key];
                      else next[field.key] = value;
                      return next;
                    });
                  }}
                  className="w-full h-9 px-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={-1}>— Non importé —</option>
                  {preview.headers.map((h, i) => (
                    <option key={i} value={i}>{h || `Colonne ${i + 1}`}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {mapping.bexio_nr === undefined && (
            <p className="text-xs text-amber-700 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              Sans colonne « Nr. Bexio », la déduplication au réimport repose sur l&apos;e-mail ou l&apos;égalité exacte des coordonnées.
            </p>
          )}
          <div className="overflow-x-auto border border-gray-100 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>{preview.headers.map((h, i) => <th key={i} className="px-2 py-1.5 text-left text-gray-500 whitespace-nowrap">{h || `Col. ${i + 1}`}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.sample.map((row, ri) => (
                  <tr key={ri}>{preview.headers.map((_, ci) => <td key={ci} className="px-2 py-1.5 text-gray-700 whitespace-nowrap">{row[ci] || ''}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={handleImport}
            disabled={isBusy || (mapping.last_name === undefined && mapping.company_name === undefined)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
          >
            {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Importer {preview.totalRows} ligne(s)
          </button>
        </div>
      )}

      {/* Étape 3 : bilan */}
      {result && (
        <div className="bg-white rounded-xl border border-emerald-200 p-5 space-y-3">
          <p className="text-sm font-semibold text-gray-900">3. Bilan de l&apos;import</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
              <p className="text-2xl font-bold text-emerald-700">{result.inserted}</p>
              <p className="text-xs text-gray-600">importés</p>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <p className="text-2xl font-bold text-amber-700">{result.skipped.length}</p>
              <p className="text-xs text-gray-600">ignorés (déjà présents)</p>
            </div>
            <div className="rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-2xl font-bold text-red-700">{result.rejected.length}</p>
              <p className="text-xs text-gray-600">rejetés (invalides)</p>
            </div>
          </div>
          {[...result.skipped, ...result.rejected].length > 0 && (
            <div className="max-h-48 overflow-y-auto text-xs text-gray-600 space-y-0.5">
              {result.skipped.map((s) => <p key={`s${s.row}`}>Ligne {s.row} : {s.reason}</p>)}
              {result.rejected.map((r) => <p key={`r${r.row}`}>Ligne {r.row} : {r.reason}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
