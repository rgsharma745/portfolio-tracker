export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      card_bills: {
        Row: {
          amount: number | null;
          card_id: string;
          created_at: string;
          due_date: string;
          id: string;
          notes: string | null;
          owner_id: string;
          paid_amount: number;
          paid_on: string | null;
          statement_month: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount?: number | null;
          card_id: string;
          created_at?: string;
          due_date: string;
          id?: string;
          notes?: string | null;
          owner_id?: string;
          paid_amount?: number;
          paid_on?: string | null;
          statement_month: string;
          updated_at?: string;
        };
        Update: {
          amount?: number | null;
          card_id?: string;
          created_at?: string;
          due_date?: string;
          id?: string;
          notes?: string | null;
          owner_id?: string;
          paid_amount?: number;
          paid_on?: string | null;
          statement_month?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'card_bills_card_id_fkey';
            columns: ['card_id'];
            isOneToOne: false;
            referencedRelation: 'credit_cards';
            referencedColumns: ['id'];
          },
        ];
      };
      credit_cards: {
        Row: {
          bank: string | null;
          bill_day: number | null;
          created_at: string;
          due_day: number | null;
          id: string;
          is_active: boolean;
          name: string;
          owner_id: string;
          portfolio_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          bank?: string | null;
          bill_day?: number | null;
          created_at?: string;
          due_day?: number | null;
          id?: string;
          is_active?: boolean;
          name: string;
          owner_id?: string;
          portfolio_id: string;
          updated_at?: string;
        };
        Update: {
          bank?: string | null;
          bill_day?: number | null;
          created_at?: string;
          due_day?: number | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          owner_id?: string;
          portfolio_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'credit_cards_portfolio_id_fkey';
            columns: ['portfolio_id'];
            isOneToOne: false;
            referencedRelation: 'portfolios';
            referencedColumns: ['id'];
          },
        ];
      };
      fx_latest: {
        Row: {
          is_manual: boolean;
          pair: string;
          prev_rate: number | null;
          prev_rate_date: string | null;
          rate: number;
          rate_date: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          is_manual?: boolean;
          pair: string;
          prev_rate?: number | null;
          prev_rate_date?: string | null;
          rate: number;
          rate_date: string;
          updated_at?: string;
        };
        Update: {
          is_manual?: boolean;
          pair?: string;
          prev_rate?: number | null;
          prev_rate_date?: string | null;
          rate?: number;
          rate_date?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      job_runs: {
        Row: {
          finished_at: string | null;
          id: number;
          job: string;
          message: string | null;
          started_at: string;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          finished_at?: string | null;
          id?: never;
          job: string;
          message?: string | null;
          started_at?: string;
          status: string;
        };
        Update: {
          finished_at?: string | null;
          id?: never;
          job?: string;
          message?: string | null;
          started_at?: string;
          status?: string;
        };
        Relationships: [];
      };
      job_triggers: {
        Row: {
          job: string;
          triggered_at: string;
          triggered_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          job: string;
          triggered_at: string;
          triggered_by?: string | null;
        };
        Update: {
          job?: string;
          triggered_at?: string;
          triggered_by?: string | null;
        };
        Relationships: [];
      };
      mf_holdings: {
        Row: {
          created_at: string;
          folio: string | null;
          id: string;
          invested: number;
          owner_id: string;
          portfolio_id: string;
          scheme_code: string | null;
          scheme_name: string;
          units: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          folio?: string | null;
          id?: string;
          invested?: number;
          owner_id?: string;
          portfolio_id: string;
          scheme_code?: string | null;
          scheme_name: string;
          units?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          folio?: string | null;
          id?: string;
          invested?: number;
          owner_id?: string;
          portfolio_id?: string;
          scheme_code?: string | null;
          scheme_name?: string;
          units?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mf_holdings_portfolio_id_fkey';
            columns: ['portfolio_id'];
            isOneToOne: false;
            referencedRelation: 'portfolios';
            referencedColumns: ['id'];
          },
        ];
      };
      mf_nav_latest: {
        Row: {
          nav: number;
          nav_date: string;
          prev_nav: number | null;
          prev_nav_date: string | null;
          scheme_code: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          nav: number;
          nav_date: string;
          prev_nav?: number | null;
          prev_nav_date?: string | null;
          scheme_code: string;
          updated_at?: string;
        };
        Update: {
          nav?: number;
          nav_date?: string;
          prev_nav?: number | null;
          prev_nav_date?: string | null;
          scheme_code?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      pf_entries: {
        Row: {
          company: string;
          contribution_type: string;
          created_at: string;
          employee_amount: number;
          employer_amount: number;
          id: string;
          owner_id: string;
          pension_amount: number;
          portfolio_id: string;
          updated_at: string;
          wage_month: string;
        };
        ComputedFields: never;
        Insert: {
          company: string;
          contribution_type: string;
          created_at?: string;
          employee_amount?: number;
          employer_amount?: number;
          id?: string;
          owner_id?: string;
          pension_amount?: number;
          portfolio_id: string;
          updated_at?: string;
          wage_month: string;
        };
        Update: {
          company?: string;
          contribution_type?: string;
          created_at?: string;
          employee_amount?: number;
          employer_amount?: number;
          id?: string;
          owner_id?: string;
          pension_amount?: number;
          portfolio_id?: string;
          updated_at?: string;
          wage_month?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pf_entries_portfolio_id_fkey';
            columns: ['portfolio_id'];
            isOneToOne: false;
            referencedRelation: 'portfolios';
            referencedColumns: ['id'];
          },
        ];
      };
      portfolio_snapshots: {
        Row: {
          card_dues: number;
          id: string;
          mf_value: number;
          owner_id: string;
          pf_balance: number;
          portfolio_id: string;
          rsu_vested_value: number;
          savings: number;
          snap_date: string;
          stocks_value: number;
        };
        ComputedFields: never;
        Insert: {
          card_dues?: number;
          id?: string;
          mf_value?: number;
          owner_id?: string;
          pf_balance?: number;
          portfolio_id: string;
          rsu_vested_value?: number;
          savings?: number;
          snap_date: string;
          stocks_value?: number;
        };
        Update: {
          card_dues?: number;
          id?: string;
          mf_value?: number;
          owner_id?: string;
          pf_balance?: number;
          portfolio_id?: string;
          rsu_vested_value?: number;
          savings?: number;
          snap_date?: string;
          stocks_value?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'portfolio_snapshots_portfolio_id_fkey';
            columns: ['portfolio_id'];
            isOneToOne: false;
            referencedRelation: 'portfolios';
            referencedColumns: ['id'];
          },
        ];
      };
      portfolios: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          owner_id: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          owner_id?: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          owner_id?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      rsu_grants: {
        Row: {
          created_at: string;
          grant_date: string | null;
          grant_label: string;
          id: string;
          owner_id: string;
          portfolio_id: string;
          symbol: string;
          tax_rate: number;
          units_granted: number;
          units_sold_for_tax: number;
          units_vested: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          grant_date?: string | null;
          grant_label: string;
          id?: string;
          owner_id?: string;
          portfolio_id: string;
          symbol: string;
          tax_rate?: number;
          units_granted?: number;
          units_sold_for_tax?: number;
          units_vested?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          grant_date?: string | null;
          grant_label?: string;
          id?: string;
          owner_id?: string;
          portfolio_id?: string;
          symbol?: string;
          tax_rate?: number;
          units_granted?: number;
          units_sold_for_tax?: number;
          units_vested?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rsu_grants_portfolio_id_fkey';
            columns: ['portfolio_id'];
            isOneToOne: false;
            referencedRelation: 'portfolios';
            referencedColumns: ['id'];
          },
        ];
      };
      savings_accounts: {
        Row: {
          balance: number;
          bank: string;
          id: string;
          owner_id: string;
          portfolio_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          balance?: number;
          bank: string;
          id?: string;
          owner_id?: string;
          portfolio_id: string;
          updated_at?: string;
        };
        Update: {
          balance?: number;
          bank?: string;
          id?: string;
          owner_id?: string;
          portfolio_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'savings_accounts_portfolio_id_fkey';
            columns: ['portfolio_id'];
            isOneToOne: false;
            referencedRelation: 'portfolios';
            referencedColumns: ['id'];
          },
        ];
      };
      settings: {
        Row: {
          id: string;
          key: string;
          owner_id: string;
          value: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          key: string;
          owner_id?: string;
          value?: NonNullable<Json>;
        };
        Update: {
          id?: string;
          key?: string;
          owner_id?: string;
          value?: NonNullable<Json>;
        };
        Relationships: [];
      };
      stock_holdings: {
        Row: {
          avg_price: number | null;
          created_at: string;
          currency: string;
          id: string;
          invested: number;
          market: string;
          name: string | null;
          owner_id: string;
          portfolio_id: string;
          quantity: number;
          symbol: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          avg_price?: number | null;
          created_at?: string;
          currency?: string;
          id?: string;
          invested?: number;
          market?: string;
          name?: string | null;
          owner_id?: string;
          portfolio_id: string;
          quantity?: number;
          symbol: string;
          updated_at?: string;
        };
        Update: {
          avg_price?: number | null;
          created_at?: string;
          currency?: string;
          id?: string;
          invested?: number;
          market?: string;
          name?: string | null;
          owner_id?: string;
          portfolio_id?: string;
          quantity?: number;
          symbol?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'stock_holdings_portfolio_id_fkey';
            columns: ['portfolio_id'];
            isOneToOne: false;
            referencedRelation: 'portfolios';
            referencedColumns: ['id'];
          },
        ];
      };
      stock_price_latest: {
        Row: {
          close: number;
          is_manual: boolean;
          prev_close: number | null;
          prev_price_date: string | null;
          price_date: string;
          source: string | null;
          symbol: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          close: number;
          is_manual?: boolean;
          prev_close?: number | null;
          prev_price_date?: string | null;
          price_date: string;
          source?: string | null;
          symbol: string;
          updated_at?: string;
        };
        Update: {
          close?: number;
          is_manual?: boolean;
          prev_close?: number | null;
          prev_price_date?: string | null;
          price_date?: string;
          source?: string | null;
          symbol?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      v_card_bills: {
        Row: {
          amount: number | null;
          balance: number | null;
          card_id: string;
          card_name: string;
          created_at: string;
          due_date: string;
          id: string;
          notes: string | null;
          owner_id: string;
          paid_amount: number;
          paid_on: string | null;
          portfolio_id: string;
          statement_month: string;
          status: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: 'card_bills_card_id_fkey';
            columns: ['card_id'];
            isOneToOne: false;
            referencedRelation: 'credit_cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'credit_cards_portfolio_id_fkey';
            columns: ['portfolio_id'];
            isOneToOne: false;
            referencedRelation: 'portfolios';
            referencedColumns: ['id'];
          },
        ];
      };
      v_mf_holdings: {
        Row: {
          created_at: string;
          current_value: number | null;
          day_change: number | null;
          folio: string | null;
          id: string;
          invested: number;
          nav: number | null;
          nav_date: string | null;
          owner_id: string;
          pl: number | null;
          portfolio_id: string;
          prev_nav: number | null;
          scheme_code: string | null;
          scheme_name: string;
          units: number;
          updated_at: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: 'mf_holdings_portfolio_id_fkey';
            columns: ['portfolio_id'];
            isOneToOne: false;
            referencedRelation: 'portfolios';
            referencedColumns: ['id'];
          },
        ];
      };
      v_stock_holdings: {
        Row: {
          avg_price: number | null;
          created_at: string;
          currency: string;
          current_value: number | null;
          day_change: number | null;
          id: string;
          invested: number;
          last_close: number | null;
          market: string;
          name: string | null;
          owner_id: string;
          pl: number | null;
          portfolio_id: string;
          prev_close: number | null;
          price_date: string | null;
          quantity: number;
          symbol: string;
          updated_at: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: 'stock_holdings_portfolio_id_fkey';
            columns: ['portfolio_id'];
            isOneToOne: false;
            referencedRelation: 'portfolios';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      claim_job_trigger: {
        Args: { p_job: string };
        Returns: {
          claimed: boolean;
          claimed_at: string;
          next_allowed_at: string;
        }[];
      };
      release_job_trigger: { Args: { p_at: string; p_job: string }; Returns: undefined };
      upsert_fx_rate: {
        Args: { p_date: string; p_pair: string; p_rate: number };
        Returns: undefined;
      };
      upsert_mf_nav: {
        Args: { p_code: string; p_date: string; p_nav: number };
        Returns: undefined;
      };
      upsert_stock_price: {
        Args: { p_close: number; p_date: string; p_source?: string; p_symbol: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
