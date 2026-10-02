export const STATIC_PAGES: Record<string, { title: string; content: string; desc?: string; canonicalUrl: string; ogType?: 'website' | 'article'; jsonLd?: string; ogImage?: string; articlePublishedTime?: string; articleAuthor?: string }> = {
  '/about': { title: 'About our community', canonicalUrl: '/about', desc: 'A community for conversations, shared interests, and connection.', content: `<section class="card"><h1>Welcome to our community</h1><p>A place to share ideas, ask questions, meet people, and keep the conversation going.</p><p>Explore the discussion rooms, join live chat, and make yourself at home.</p><p><a href="/tos">Read the community guidelines</a></p></section>` },
};

STATIC_PAGES['/about/community'] = { ...STATIC_PAGES['/about']!, canonicalUrl: '/about/community' };
