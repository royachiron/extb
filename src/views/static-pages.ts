export const STATIC_PAGES: Record<string, { title: string; content: string; desc?: string; canonicalUrl: string; ogType?: 'website' | 'article'; jsonLd?: string; ogImage?: string; articlePublishedTime?: string; articleAuthor?: string }> = {
  '/about': { title: 'About our community', canonicalUrl: '/about', desc: 'A community for conversations, shared interests, and connection.', content: `<section class="card"><h1><!--extb-ui-->Welcome to our community<!--/extb-ui--></h1><p><!--extb-ui-->A place to share ideas, ask questions, meet people, and keep the conversation going.<!--/extb-ui--></p><p><!--extb-ui-->Explore the discussion rooms, join live chat, and make yourself at home.<!--/extb-ui--></p><p><a href="/tos"><!--extb-ui-->Read the community guidelines<!--/extb-ui--></a></p></section>` },
};

STATIC_PAGES['/about/community'] = { ...STATIC_PAGES['/about']!, canonicalUrl: '/about/community' };
