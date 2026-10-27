/**
 * Siste nyheter fra Selskap → Nyheter. ProTop har ett sted for nyheter; ISO viser dem og lenker dit.
 */
import { useEffect, useState } from 'react';
import { listenCompanyWall } from '../../src/project/companyWall';

export function useCompanyNews(companyId, { limit = 5 } = {}) {
  const [posts, setPosts] = useState([]);
  useEffect(() => {
    if (!companyId) return undefined;
    return listenCompanyWall(companyId, (list) => setPosts((list || []).filter((p) => p.deleted !== true)));
  }, [companyId]);
  // Kvalitet, miljø og HMS først, deretter resten etter dato (listen kommer nyeste først).
  const own = posts.filter((p) => p.category === 'ledelsessystem');
  const rest = posts.filter((p) => p.category !== 'ledelsessystem');
  return { posts, top: [...own, ...rest].slice(0, limit), own };
}

export function postDate(p) {
  const t = p?.createdAt?.toDate ? p.createdAt.toDate() : (p?.createdAt?.seconds ? new Date(p.createdAt.seconds * 1000) : null);
  return t ? t.toISOString().slice(0, 10) : '';
}
