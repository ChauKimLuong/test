'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from './ui';
export function useUnsavedNavigation(isDirty: () => boolean) {
  const router = useRouter(),
    { confirm } = useSession(),
    check = useRef(isDirty),
    pending = useRef(false);
  check.current = isDirty;
  useEffect(() => {
    const handler = async (e: MouseEvent) => {
      if (
        !check.current() ||
        e.defaultPrevented ||
        e.button !== 0 ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const link = (e.target as Element)?.closest<HTMLAnchorElement>('a[href]');
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      const url = new URL(link.href, window.location.href);
      if (
        url.href === window.location.href ||
        (url.hash && url.pathname === window.location.pathname)
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      if (pending.current) return;
      pending.current = true;
      try {
        if (
          await confirm(
            'Rời trang khi chưa lưu?',
            'Thay đổi chưa lưu sẽ bị bỏ. Bạn có thể quay lại để lưu bản nháp trước.',
          )
        ) {
          if (url.origin === window.location.origin)
            router.push(url.pathname + url.search + url.hash);
          else window.location.assign(url.href);
        }
      } finally {
        pending.current = false;
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [router, confirm]);
}
