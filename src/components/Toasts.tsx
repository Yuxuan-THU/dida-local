import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../store';
import { cx } from './ui';

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="toast-stack" aria-live="polite">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            className={cx('toast', `is-${toast.type}`)}
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <span className="toast-icon">
              {toast.type === 'success' ? <CheckCircle2 size={17} /> : toast.type === 'error' ? <AlertCircle size={17} /> : <Info size={17} />}
            </span>
            <span className="toast-message">{toast.message}</span>
            {toast.action && (
              <button className="toast-action" onClick={toast.action.onClick}>{toast.action.label}</button>
            )}
            <button className="toast-close" onClick={() => dismissToast(toast.id)} aria-label="关闭提示">
              <X size={13} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}