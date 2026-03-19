import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const COUNT_KEY = 'tradechip:interest:count';
const IP_SET_KEY = 'tradechip:interest:ips';

function getClientIp(request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  return 'unknown';
}

async function getCount() {
  const count = await redis.get(COUNT_KEY);
  return Number(count || 0);
}

export async function GET() {
  try {
    const count = await getCount();
    return Response.json(
      { count },
      {
        headers: {
          'Cache-Control': 'no-store'
        }
      }
    );
  } catch (error) {
    return Response.json(
      { error: 'Failed to fetch interest count.' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const ip = getClientIp(request);

    if (!ip || ip === 'unknown') {
      const count = await getCount();
      return Response.json(
        {
          count,
          alreadyCounted: true,
          error: 'Could not verify IP.'
        },
        { status: 400 }
      );
    }

    const exists = await redis.sismember(IP_SET_KEY, ip);

    if (exists) {
      const count = await getCount();
      return Response.json({
        count,
        alreadyCounted: true
      });
    }

    const tx = redis.multi();
    tx.sadd(IP_SET_KEY, ip);
    tx.incr(COUNT_KEY);
    const results = await tx.exec();

    const newCount = Number(results?.[1] ?? 0);

    return Response.json({
      count: newCount,
      alreadyCounted: false
    });
  } catch (error) {
    return Response.json(
      { error: 'Failed to record interest.' },
      { status: 500 }
    );
  }
}