import { bexioFetch, bexioList } from './client';
import type { BexioArticle } from './types';

export async function listArticles(limit = 500): Promise<BexioArticle[]> {
  return bexioList<BexioArticle>(`/2.0/article?order_by=intern_name`, limit);
}

export async function getArticle(id: number): Promise<BexioArticle> {
  return bexioFetch<BexioArticle>(`/2.0/article/${id}`);
}
