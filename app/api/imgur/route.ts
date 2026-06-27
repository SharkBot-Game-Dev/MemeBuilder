import { NextRequest } from "next/server";

type RateBucket = {
  count: number;
  resetAt: number;
};

type ImgurImage = {
  id: string;
  title: string;
  url: string;
  width: number | null;
  height: number | null;
  type: string;
};

type ImgurItem = {
  id?: string;
  title?: string;
  link?: string;
  type?: string;
  width?: number;
  height?: number;
  images?: ImgurItem[];
};

const buckets = new Map<string, RateBucket>();

const RATE_LIMIT = Number(process.env.IMGUR_RATE_LIMIT_REQUESTS ?? 20);
const WINDOW_MS =
  Number(process.env.IMGUR_RATE_LIMIT_WINDOW_SECONDS ?? 15 * 60) * 1000;

function getClientKey(request: NextRequest) {
  const directIp =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("true-client-ip") ||
    request.headers.get("x-real-ip");
  const forwarded = request.headers.get("x-forwarded-for");
  const forwardedIp = forwarded?.split(",")[0]?.trim();

  return directIp?.trim() || forwardedIp || "unknown-ip";
}

function checkRateLimit(key: string) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const next = { count: 1, resetAt: now + WINDOW_MS };
    buckets.set(key, next);
    return { limited: false, remaining: Math.max(RATE_LIMIT - 1, 0), ...next };
  }

  if (bucket.count >= RATE_LIMIT) {
    return { limited: true, remaining: 0, ...bucket };
  }

  bucket.count += 1;
  return {
    limited: false,
    remaining: Math.max(RATE_LIMIT - bucket.count, 0),
    ...bucket,
  };
}

function rateHeaders(bucket: { remaining: number; resetAt: number }) {
  return {
    "Cache-Control": "no-store",
    "X-RateLimit-Limit": String(RATE_LIMIT),
    "X-RateLimit-Remaining": String(bucket.remaining),
    "X-RateLimit-Reset": String(Math.ceil(bucket.resetAt / 1000)),
  };
}

function normalizeImgurItems(items: ImgurItem[]): ImgurImage[] {
  return items
    .flatMap((item) => item.images?.length ? item.images : [item])
    .filter((item) => item.type?.startsWith("image/") && item.link)
    .filter((item) => !item.link?.endsWith(".gifv") && item.type !== "image/gif")
    .slice(0, 15)
    .map((item) => ({
      id: item.id ?? item.link ?? crypto.randomUUID(),
      title: item.title?.trim() || "Imgur image",
      url: item.link as string,
      width: item.width ?? null,
      height: item.height ?? null,
      type: item.type ?? "image/jpeg",
    }));
}

export async function GET(request: NextRequest) {
  const clientId = process.env.IMGUR_CLIENT_ID;
  const key = getClientKey(request);
  const bucket = checkRateLimit(key);
  const headers = rateHeaders(bucket);

  if (bucket.limited) {
    return Response.json(
      { error: "画像取得APIの取得回数が上限に達しました。少し待ってから再試行してください。" },
      { status: 429, headers },
    );
  }

  if (!clientId) {
    return Response.json(
      { error: "内部エラーが発生しました。" },
      { status: 503, headers },
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() || "meme";
  const sort = searchParams.get("sort") || "top";
  const page = searchParams.get("page") || "0";
  const upstream = new URL(
    `https://api.imgur.com/3/gallery/search/${encodeURIComponent(sort)}/${encodeURIComponent(page)}`,
  );
  upstream.searchParams.set("q", query);

  const response = await fetch(upstream, {
    headers: {
      Authorization: `Client-ID ${clientId}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return Response.json(
      { error: "画像取得APIから画像を取得できませんでした。" },
      { status: response.status, headers },
    );
  }

  const payload = (await response.json()) as { data?: ImgurItem[] };
  return Response.json(
    {
      images: normalizeImgurItems(payload.data ?? []),
      rateLimit: {
        limit: RATE_LIMIT,
        remaining: bucket.remaining,
        resetAt: bucket.resetAt,
      },
    },
    { headers },
  );
}
