'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { createClient } from '@/lib/supabase/client';
import type { Regie } from '@/types/database';
import { Building, Loader2, Pencil } from 'lucide-react';

interface RegieModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  regieToEdit?: Regie | null;
}

export function RegieModal({ isOpen, onClose, onSuccess, regieToEdit }: RegieModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const isEditMode = !!regieToEdit;
  
  const [formData, setFormData] = useState({
    name: '',
    email_contact: '',
    keyword: '',
    address: '',
  });

  // Initialize form data when editing
  useEffect(() => {
    if (regieToEdit) {
      setFormData({
        name: regieToEdit.name || '',
        email_contact: regieToEdit.email_contact || '',
        keyword: regieToEdit.keyword || '',
        address: regieToEdit.address || '',
      });
    } else {
      setFormData({
        name: '',
        email_contact: '',
        keyword: '',
        address: '',
      });
    }
    setError(null);
  }, [regieToEdit, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const supabase = createClient();
      
      if (isEditMode && regieToEdit) {
        // UPDATE existing regie
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (supabase as any)
          .from('regies')
          .update({
            name: formData.name.trim(),
            email_contact: formData.email_contact.trim() || null,
            keyword: formData.keyword.trim().toUpperCase(),
            address: formData.address.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', regieToEdit.id);

        if (updateError) {
          throw updateError;
        }
      } else {
        // INSERT new regie
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: insertError } = await (supabase as any)
          .from('regies')
          .insert({
            name: formData.name.trim(),
            email_contact: formData.email_contact.trim() || null,
            keyword: formData.keyword.trim().toUpperCase(),
            address: formData.address.trim() || null,
            is_active: true,
            discount_percentage: 0,
          });

        if (insertError) {
          throw insertError;
        }
      }

      // Reset form
      setFormData({
        name: '',
        email_contact: '',
        keyword: '',
        address: '',
      });
      
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error saving regie:', err);
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const modalTitle = isEditMode ? 'Modifier la régie' : 'Nouvelle régie';
  const submitLabel = isEditMode ? 'Enregistrer' : 'Créer';
  const loadingLabel = isEditMode ? 'Enregistrement...' : 'Création...';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Icon header */}
        <div className="flex justify-center mb-6">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${isEditMode ? 'bg-amber-50' : 'bg-blue-50'}`}>
            {isEditMode ? (
              <Pencil className="w-8 h-8 text-amber-600" />
            ) : (
              <Building className="w-8 h-8 text-blue-600" />
            )}
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Name */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Nom de la régie *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            required
            value={formData.name}
            onChange={handleChange}
            placeholder="Ex: Régie Immobilière SA"
            className="w-full h-11 px-4 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email_contact" className="block text-sm font-medium text-gray-700 mb-1">
            Email de contact
          </label>
          <input
            type="email"
            id="email_contact"
            name="email_contact"
            value={formData.email_contact}
            onChange={handleChange}
            placeholder="contact@regie.ch"
            className="w-full h-11 px-4 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>

        {/* Keyword/Code */}
        <div>
          <label htmlFor="keyword" className="block text-sm font-medium text-gray-700 mb-1">
            Code / Mot-clé *
          </label>
          <input
            type="text"
            id="keyword"
            name="keyword"
            required
            value={formData.keyword}
            onChange={handleChange}
            placeholder="Ex: TEST"
            className="w-full h-11 px-4 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all uppercase"
          />
          <p className="mt-1 text-xs text-gray-500">
            Code unique utilisé pour identifier la régie dans les emails
          </p>
        </div>

        {/* Address */}
        <div>
          <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
            Adresse
          </label>
          <input
            type="text"
            id="address"
            name="address"
            value={formData.address}
            onChange={handleChange}
            placeholder="Rue de la Gare 1, 1000 Lausanne"
            className="w-full h-11 px-4 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 h-11 px-4 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={isLoading || !formData.name.trim() || !formData.keyword.trim()}
            className={`flex-1 h-11 px-4 text-sm font-medium text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
              isEditMode 
                ? 'bg-amber-600 hover:bg-amber-700' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {loadingLabel}
              </>
            ) : (
              submitLabel
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Backward compatibility alias
export const CreateRegieModal = RegieModal;
