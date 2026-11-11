const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api';

export type ApiUser = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type ApiAccount = {
  id: string;
  name: string;
  institution?: string | null;
  type: string;
  currency: string;
  balanceCents: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ApiTransaction = {
  id: string;
  accountId: string;
  userId: string;
  categoryId?: string | null;
  description: string;
  amountCents: string;
  type: string;
  origin: string;
  providerId?: string | null;
  date: string;
  createdAt: string;
  updatedAt: string;
};

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(
    path: string,
    { method = 'GET', body }: { method?: string; body?: unknown } = {}
  ): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${text}`);
    }

    if (res.status === 204) {
      return undefined as T;
    }

    return res.json();
  }

  async register(dto: { email: string; name: string; password: string }) {
    return this.request<{ user: ApiUser; token: string }>('/auth/register', {
      method: 'POST',
      body: dto,
    });
  }

  async login(dto: { email: string; password: string }) {
    return this.request<{ user: ApiUser; token: string }>('/auth/login', {
      method: 'POST',
      body: dto,
    });
  }

  async getAccounts() {
    return this.request<ApiAccount[]>('/accounts');
  }

  async createAccount(dto: {
    name: string;
    institution?: string;
    type?: string;
    currency?: string;
  }) {
    return this.request<ApiAccount>('/accounts', {
      method: 'POST',
      body: dto,
    });
  }

  async getTransactions() {
    return this.request<ApiTransaction[]>('/transactions');
  }

  async createTransaction(dto: {
    accountId: string;
    description: string;
    amountCents: string;
    type: string;
    categoryId?: string;
    date: string;
  }) {
    return this.request<ApiTransaction>('/transactions', {
      method: 'POST',
      body: dto,
    });
  }
}

export const api = new ApiClient();
