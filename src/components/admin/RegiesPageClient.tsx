'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { Regie } from '@/types/database';
import { RegieModal } from './CreateRegieModal';
import { createClient } from '@/lib/supabase/client';
import {
  Building,
  Plus,
  Search,
  MoreVertical,
  Mail,
  Phone,
  MapPin,
  Percent,
  Pencil,
  Trash2,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

interface RegiesPageClientProps {
  regies: Regie[] | null;
}

// Dropdown Menu Component
function DropdownMenu({ 
  regie, 
  onEdit, 
  onDelete 
}: { 
  regie: Regie; 
  onEdit: (regie: Regie) => void;
  onDelete: (regie: Regie) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-20">
          <button
            onClick={() => {
              onEdit(regie);
              setIsOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Pencil className="w-4 h-4" />
            Modifier
          </button>
          <button
            onClick={() => {
              onDelete(regie);
              setIsOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Supprimer
          </button>
        </div>
      )}
    </div>
  );
}

// Delete Confirmation Modal
function DeleteConfirmModal({
  isOpen,
  regie,
  onClose,
  onConfirm,
  isDeleting,
}: {
  isOpen: boolean;
  regie: Regie | null;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}) {
  if (!isOpen || !regie) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-xl p-6">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-red-600" />
          </div>
        </div>
        
        <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
          Supprimer la régie ?
        </h3>
        <p className="text-sm text-gray-500 text-center mb-6">
          Voulez-vous vraiment supprimer <strong>{regie.name}</strong> ? Cette action est irréversible.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 h-11 px-4 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 h-11 px-4 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Suppression...
              </>
            ) : (
              'Supprimer'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RegiesPageClient({ regies }: RegiesPageClientProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [regieToEdit, setRegieToEdit] = useState<Regie | null>(null);
  const [regieToDelete, setRegieToDelete] = useState<Regie | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSuccess = useCallback(() => {
    router.refresh();
  }, [router]);

  const handleEdit = useCallback((regie: Regie) => {
    setRegieToEdit(regie);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setRegieToEdit(null);
  }, []);

  const handleOpenCreate = useCallback(() => {
    setRegieToEdit(null);
    setIsModalOpen(true);
  }, []);

  const handleDelete = useCallback((regie: Regie) => {
    setRegieToDelete(regie);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!regieToDelete) return;
    
    setIsDeleting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('regies')
        .delete()
        .eq('id', regieToDelete.id);

      if (error) throw error;

      setRegieToDelete(null);
      router.refresh();
    } catch (err) {
      console.error('Error deleting regie:', err);
      alert('Erreur lors de la suppression');
    } finally {
      setIsDeleting(false);
    }
  }, [regieToDelete, router]);

  // Calculate stats
  const stats = {
    total: regies?.length || 0,
    active: regies?.filter(r => r.is_active).length || 0,
    withDiscount: regies?.filter(r => r.discount_percentage > 0).length || 0,
  };

  // Filter regies based on search
  const filteredRegies = regies?.filter(regie => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      regie.name.toLowerCase().includes(query) ||
      regie.keyword.toLowerCase().includes(query) ||
      regie.email_contact?.toLowerCase().includes(query) ||
      regie.address?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <Building className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-sm text-gray-500">Régies partenaires</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
              <Building className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
              <p className="text-sm text-gray-500">Régies actives</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center">
              <Percent className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.withDiscount}</p>
              <p className="text-sm text-gray-500">Avec remise</p>
            </div>
          </div>
        </div>
      </div>

      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-gray-500">
            Régies immobilières partenaires et leurs conditions tarifaires
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 h-10 pl-10 pr-4 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nouvelle régie</span>
          </button>
        </div>
      </div>

      {/* Regies List */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
        {!filteredRegies || filteredRegies.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Building className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {searchQuery ? 'Aucun résultat' : 'Aucune régie'}
            </h3>
            <p className="text-gray-500 max-w-sm mx-auto">
              {searchQuery 
                ? 'Aucune régie ne correspond à votre recherche.'
                : 'Ajoutez vos premières régies partenaires pour commencer à gérer les interventions.'
              }
            </p>
            {!searchQuery && (
              <button
                onClick={handleOpenCreate}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Ajouter une régie
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredRegies.map((regie) => (
              <div key={regie.id} className="p-6 hover:bg-gray-50/50 transition-colors">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={cn(
                    'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
                    regie.is_active ? 'bg-blue-50' : 'bg-gray-100'
                  )}>
                    <Building className={cn(
                      'w-6 h-6',
                      regie.is_active ? 'text-blue-600' : 'text-gray-400'
                    )} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className={cn(
                            'font-semibold',
                            regie.is_active ? 'text-gray-900' : 'text-gray-400'
                          )}>
                            {regie.name}
                          </h3>
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            {regie.keyword}
                          </span>
                          {!regie.is_active && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                              Inactive
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {regie.discount_percentage > 0 && (
                          <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-green-100 text-green-700">
                            -{regie.discount_percentage}% remise
                          </span>
                        )}
                        <DropdownMenu 
                          regie={regie} 
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                        />
                      </div>
                    </div>

                    {/* Contact info */}
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                      {regie.email_contact && (
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-4 h-4" />
                          <span>{regie.email_contact}</span>
                        </div>
                      )}
                      {regie.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-4 h-4" />
                          <span>{regie.phone}</span>
                        </div>
                      )}
                      {regie.address && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-4 h-4" />
                          <span className="truncate max-w-[250px]">{regie.address}</span>
                        </div>
                      )}
                    </div>

                    {/* Billing email if different */}
                    {regie.billing_email && regie.billing_email !== regie.email_contact && (
                      <p className="mt-2 text-xs text-gray-400">
                        Facturation: {regie.billing_email}
                      </p>
                    )}

                    {/* Notes */}
                    {regie.notes && (
                      <p className="mt-2 text-sm text-gray-600 bg-gray-50 p-2 rounded-lg">
                        {regie.notes}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Regie Modal */}
      <RegieModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSuccess={handleSuccess}
        regieToEdit={regieToEdit}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={!!regieToDelete}
        regie={regieToDelete}
        onClose={() => setRegieToDelete(null)}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
}
