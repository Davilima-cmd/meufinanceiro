'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

/* -------------------------------------------------------------------------
   Camada de diálogos do app (substitui window.confirm / window.alert)
   ------------------------------------------------------------------------- */

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
};

export type NoticeOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: 'default' | 'success' | 'danger';
};

type PendingRequest =
  { kind: 'confirm'; options: ConfirmOptions } | { kind: 'notice'; options: NoticeOptions };

type DialogRequest = PendingRequest & { id: number; resolve: (value: boolean) => void };

type DialogApi = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  notice: (options: NoticeOptions) => Promise<boolean>;
};

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const api = useContext(DialogContext);
  if (!api) throw new Error('useDialog precisa estar dentro de <DialogProvider>');
  return api;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const requestId = useRef(0);

  const open = useCallback((next: PendingRequest) => {
    requestId.current += 1;
    const id = requestId.current;
    return new Promise<boolean>((resolve) => {
      setRequest((current) => {
        // Um pedido pendente é descartado como "cancelado" ao ser substituído.
        current?.resolve(false);
        return { ...next, id, resolve } as DialogRequest;
      });
    });
  }, []);

  const api = useMemo<DialogApi>(
    () => ({
      confirm: (options) => open({ kind: 'confirm', options }),
      notice: (options) => open({ kind: 'notice', options }),
    }),
    [open]
  );

  function settle(value: boolean) {
    setRequest((current) => {
      current?.resolve(value);
      return null;
    });
  }

  return (
    <DialogContext.Provider value={api}>
      {children}
      {request ? (
        <AppDialog
          key={request.id}
          onCancel={() => settle(false)}
          onConfirm={() => settle(true)}
          request={request}
        />
      ) : null}
    </DialogContext.Provider>
  );
}

function AppDialog({
  request,
  onConfirm,
  onCancel,
}: {
  request: DialogRequest;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const isConfirm = request.kind === 'confirm';
  const confirmOptions = isConfirm ? (request.options as ConfirmOptions) : null;
  const noticeOptions = isConfirm ? null : (request.options as NoticeOptions);
  const tone = isConfirm ? (confirmOptions?.tone ?? 'danger') : (noticeOptions?.tone ?? 'default');
  const confirmLabel = isConfirm
    ? (confirmOptions?.confirmLabel ?? 'Excluir')
    : (noticeOptions?.confirmLabel ?? 'Entendi');

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="dialog-backdrop" onClick={onCancel} role="presentation">
      <div
        aria-describedby={request.options.description ? 'app-dialog-description' : undefined}
        aria-labelledby="app-dialog-title"
        aria-modal="true"
        className="dialog dialog-compact"
        onClick={(event) => event.stopPropagation()}
        role="alertdialog"
      >
        <header className="dialog-header">
          <div>
            <p className="eyebrow">{isConfirm ? 'Confirmação' : 'Aviso'}</p>
            <h2 id="app-dialog-title">{request.options.title}</h2>
          </div>
          <button aria-label="Fechar" className="icon-button" onClick={onCancel} type="button">
            ✕
          </button>
        </header>
        {request.options.description ? (
          <p className="dialog-text" id="app-dialog-description">
            {request.options.description}
          </p>
        ) : null}
        <div className="dialog-footer">
          {isConfirm ? (
            <button className="button button-ghost" onClick={onCancel} type="button">
              {confirmOptions?.cancelLabel ?? 'Cancelar'}
            </button>
          ) : null}
          <button
            className={`button ${tone === 'danger' ? 'button-danger' : 'button-primary'}`}
            onClick={onConfirm}
            ref={confirmRef}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Select próprio (o menu nativo do sistema não combina com o painel)
   ------------------------------------------------------------------------- */

export type SelectOption = {
  value: string;
  label: string;
  hint?: string;
  color?: string;
  disabled?: boolean;
};

export function Select({
  options,
  value,
  onChange,
  label,
  placeholder = 'Escolha…',
  id,
  disabled = false,
  className = '',
}: {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const generatedId = useId();
  const listId = `${id ?? generatedId}-listbox`;

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // O foco vai para o menu assim que ele monta, para as setas navegarem as opções.
    listRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const option = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    option?.scrollIntoView?.({ block: 'nearest' });
  }, [open, activeIndex]);

  function openMenu() {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function choose(option: SelectOption) {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function move(delta: number) {
    if (options.length === 0) return;
    let next = activeIndex;
    for (let step = 0; step < options.length; step += 1) {
      next = (next + delta + options.length) % options.length;
      if (!options[next]?.disabled) break;
    }
    setActiveIndex(next);
  }

  function handleListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const option = options[activeIndex];
        if (option) choose(option);
        break;
      }
      case 'Escape':
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        break;
    }
  }

  return (
    <div className={`select ${className}`.trim()} ref={rootRef}>
      <button
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        className="select-trigger"
        disabled={disabled}
        id={id}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openMenu();
          }
        }}
        ref={triggerRef}
        type="button"
      >
        {selected ? (
          <span className="select-value">
            {selected.color ? (
              <i aria-hidden="true" className="dot-color" style={{ background: selected.color }} />
            ) : null}
            {selected.label}
          </span>
        ) : (
          <span className="select-placeholder">{placeholder}</span>
        )}
        <svg aria-hidden="true" className="select-caret" fill="none" viewBox="0 0 24 24">
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      </button>

      {open ? (
        <ul
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          aria-label={label}
          className="select-menu"
          id={listId}
          onKeyDown={handleListKeyDown}
          ref={listRef}
          role="listbox"
          tabIndex={-1}
        >
          {options.map((option, index) => (
            <li
              aria-disabled={option.disabled || undefined}
              aria-selected={option.value === value}
              className={[
                'select-option',
                option.value === value ? 'is-selected' : '',
                index === activeIndex ? 'is-active' : '',
                option.disabled ? 'is-disabled' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              data-index={index}
              id={`${listId}-${index}`}
              key={option.value || `empty-${index}`}
              onClick={() => choose(option)}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
            >
              {option.color ? (
                <i aria-hidden="true" className="dot-color" style={{ background: option.color }} />
              ) : null}
              <span className="select-option-label">{option.label}</span>
              {option.hint ? <span className="select-option-hint">{option.hint}</span> : null}
              {option.value === value ? (
                <svg aria-hidden="true" className="select-check" fill="none" viewBox="0 0 24 24">
                  <path
                    d="m5 13 4 4L19 7"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
