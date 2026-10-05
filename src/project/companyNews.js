/** Innstillinger for bedriftens nyheter. Samme rammer som familieveggen, uten familiespråk. */

export function defaultCompanyNewsSettings() {
  return {
    whoCanPost: 'members',
    images: true,
    links: true,
    reactions: true,
    notify: true,
  };
}

export function normalizeCompanyNewsSettings(raw) {
  const base = defaultCompanyNewsSettings();
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    whoCanPost: src.whoCanPost === 'admins' ? 'admins' : base.whoCanPost,
    images: src.images !== false,
    links: src.links !== false,
    reactions: src.reactions !== false,
    notify: src.notify !== false,
  };
}

export function canPublishCompanyNews(settings, isAdmin) {
  const next = normalizeCompanyNewsSettings(settings);
  if (next.whoCanPost === 'admins') return !!isAdmin;
  return true;
}

export function canManageCompanyNews(post, uid, isAdmin) {
  if (isAdmin) return true;
  return !!uid && post?.authorUid === uid;
}
