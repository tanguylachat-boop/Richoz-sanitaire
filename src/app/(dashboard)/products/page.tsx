import { createClient } from '@/lib/supabase/server';
import { formatCHF } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { PRODUCT_CATEGORIES } from '@/lib/constants';
import type { Product } from '@/types/database';
import {
  Package,
  Plus,
  Search,
  Filter,
  MoreVertical,
  AlertTriangle,
  Edit2,
} from 'lucide-react';

export default async function ProductsPage() {
  const supabase = createClient();

  // Fetch products
  const { data: productsData } = await supabase
    .from('products')
    .select('*')
    .order('category')
    .order('name');

  const products = productsData as Product[] | null;

  // Group products by category
  const productsByCategory = products?.reduce((acc, product) => {
    const category = product.category || 'autre';
    if (!acc[category]) acc[category] = [];
    acc[category].push(product);
    return acc;
  }, {} as Record<string, Product[]>) || {};

  // Calculate stats
  const stats = {
    total: products?.length || 0,
    active: products?.filter(p => p.is_active).length || 0,
    lowStock: products?.filter(p => p.track_stock && p.stock_quantity <= (p.min_stock_alert || 5)).length || 0,
  };

  const getCategoryLabel = (category: string) => {
    return PRODUCT_CATEGORIES.find(c => c.value === category)?.label || category;
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <Package className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-sm text-gray-500">Produits au total</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
              <Package className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
              <p className="text-sm text-gray-500">Produits actifs</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.lowStock}</p>
              <p className="text-sm text-gray-500">Stock faible</p>
            </div>
          </div>
        </div>
      </div>

      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-gray-500">
            Catalogue des services et pièces détachées
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher un produit..."
              className="w-full sm:w-64 h-10 pl-10 pr-4 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
          <button className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors">
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">Filtrer</span>
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nouveau produit</span>
          </button>
        </div>
      </div>

      {/* Products by Category */}
      {!products || products.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Aucun produit
          </h3>
          <p className="text-gray-500 max-w-sm mx-auto">
            Ajoutez vos premiers services et pièces détachées au catalogue.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(productsByCategory).map(([category, categoryProducts]) => (
            <div key={category} className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">
                  {getCategoryLabel(category)}
                </h3>
                <p className="text-sm text-gray-500">
                  {categoryProducts?.length} produit{(categoryProducts?.length || 0) > 1 ? 's' : ''}
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {categoryProducts?.map((product) => {
                  const isLowStock = product.track_stock && product.stock_quantity <= (product.min_stock_alert || 5);

                  return (
                    <div key={product.id} className="p-4 hover:bg-gray-50/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                          product.is_active ? 'bg-blue-50' : 'bg-gray-100'
                        )}>
                          <Package className={cn(
                            'w-5 h-5',
                            product.is_active ? 'text-blue-600' : 'text-gray-400'
                          )} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className={cn(
                                'font-medium',
                                product.is_active ? 'text-gray-900' : 'text-gray-400'
                              )}>
                                {product.name}
                              </h4>
                              {product.description && (
                                <p className="text-sm text-gray-500 truncate max-w-md">
                                  {product.description}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              {/* Price */}
                              <span className="font-semibold text-gray-900">
                                {formatCHF(product.price)}
                              </span>

                              {/* Stock indicator */}
                              {product.track_stock && (
                                <span className={cn(
                                  'px-2 py-0.5 rounded-full text-xs font-medium',
                                  isLowStock
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-gray-100 text-gray-600'
                                )}>
                                  Stock: {product.stock_quantity}
                                </span>
                              )}

                              {/* Status */}
                              {!product.is_active && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                                  Inactif
                                </span>
                              )}

                              {/* Actions */}
                              <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          {/* SKU and Supplier */}
                          <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                            {product.sku && <span>SKU: {product.sku}</span>}
                            {product.supplier && <span>Fournisseur: {product.supplier}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
