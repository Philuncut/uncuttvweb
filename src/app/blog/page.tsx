import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import VideoBlogClient from "@/components/blog/VideoBlogClient";
import {
  fetchBlogVideos,
  fetchYouTubeSubscriberCount,
  isVimeoConfigured,
  youtubeSubscribeUrl,
} from "@/lib/blog-data";

export const dynamic = "force-dynamic";

export default async function BlogPage() {
  const [youtubeVideos, vimeoVideos, subscriberCount] = await Promise.all([
    fetchBlogVideos("youtube"),
    fetchBlogVideos("vimeo"),
    fetchYouTubeSubscriberCount(),
  ]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Navbar />
      <main>
        <VideoBlogClient
          youtubeVideos={youtubeVideos}
          vimeoVideos={vimeoVideos}
          vimeoConfigured={isVimeoConfigured()}
          subscriberCount={subscriberCount}
          subscribeUrl={youtubeSubscribeUrl()}
        />
      </main>
      <Footer />
    </div>
  );
}

