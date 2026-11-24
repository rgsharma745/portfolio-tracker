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
      dividends: {
        Row: {
          amount_inr: number;
          amount_usd: number | null;
          created_at: string;
          id: string;
          market: string;
          owner_id: string;
          paid_on: string;
          portfolio_id: string;
          symbol: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount_inr: number;
          amount_usd?: number | null;
          created_at?: string;
          id?: string;
          market: string;
          owner_id?: string;
          paid_on: string;
          portfolio_id: string;
          symbol: string;
          updated_at?: string;
        };
        Update: {
          amount_inr?: number;
          amount_usd?: number | null;
          created_at?: string;
          id?: string;
          market?: string;
          owner_id?: string;
          paid_on?: string;
          portfolio_id?: string;
          symbol?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'dividends_portfolio_id_fkey';
            columns: ['portfolio_id'];
            isOneToOne: false;
            referencedRelation: 'portfolios';
            referencedColumns: ['id'];
          },
        ];
      };
      equity_events: {
        Row: {
          allotted_on: string | null;
          currency: string | null;
          fees: number;
          fmv: number | null;
          fx: number | null;
          grant_id: string;
          id: string;
          kind: string;
          occurred_on: string;
          owner_id: string;
          portfolio_id: string;
          purchase_price: number | null;
          quantity: number;
          schedule_id: string | null;
          tax_paid_inr: number | null;
          tax_units: number;
        };
        ComputedFields: never;
        Insert: {
          allotted_on?: string | null;
          currency?: string | null;
          fees?: number;
          fmv?: number | null;
          fx?: number | null;
          grant_id: string;
          id?: string;
          kind: string;
          occurred_on: string;
          owner_id?: string;
          portfolio_id: string;
          purchase_price?: number | null;
          quantity: number;
          schedule_id?: string | null;
          tax_paid_inr?: number | null;
          tax_units?: number;
        };
        Update: {
          allotted_on?: string | null;
          currency?: string | null;
          fees?: number;
          fmv?: number | null;
          fx?: number | null;
          grant_id?: string;
          id?: string;
          kind?: string;
          occurred_on?: string;
          owner_id?: string;
          portfolio_id?: string;
          purchase_price?: number | null;
          quantity?: number;
          schedule_id?: string | null;
          tax_paid_inr?: number | null;
          tax_units?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'equity_events_owner_id_portfolio_id_fkey';
            columns: ['owner_id', 'portfolio_id'];
            isOneToOne: false;
            referencedRelation: 'portfolios';
            referencedColumns: ['owner_id', 'id'];
          },
          {
            foreignKeyName: 'equity_events_owner_id_portfolio_id_grant_id_fkey';
            columns: ['owner_id', 'portfolio_id', 'grant_id'];
            isOneToOne: false;
            referencedRelation: 'equity_grants';
            referencedColumns: ['owner_id', 'portfolio_id', 'id'];
          },
          {
            foreignKeyName: 'equity_events_owner_id_portfolio_id_grant_id_schedule_id_fkey';
            columns: ['owner_id', 'portfolio_id', 'grant_id', 'schedule_id'];
            isOneToOne: false;
            referencedRelation: 'equity_schedule';
            referencedColumns: ['owner_id', 'portfolio_id', 'grant_id', 'id'];
          },
        ];
      };
      equity_grants: {
        Row: {
          expires_on: string | null;
          grant_price: number | null;
          granted_on: string;
          id: string;
          kind: string;
          label: string;
          owner_id: string;
          portfolio_id: string;
          quantity: number;
          security_id: string;
        };
        ComputedFields: never;
        Insert: {
          expires_on?: string | null;
          grant_price?: number | null;
          granted_on: string;
          id?: string;
          kind: string;
          label: string;
          owner_id?: string;
          portfolio_id: string;
          quantity: number;
          security_id: string;
        };
        Update: {
          expires_on?: string | null;
          grant_price?: number | null;
          granted_on?: string;
          id?: string;
          kind?: string;
          label?: string;
          owner_id?: string;
          portfolio_id?: string;
          quantity?: number;
          security_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'equity_grants_owner_id_portfolio_id_fkey';
            columns: ['owner_id', 'portfolio_id'];
            isOneToOne: false;
            referencedRelation: 'portfolios';
            referencedColumns: ['owner_id', 'id'];
          },
          {
            foreignKeyName: 'equity_grants_owner_id_security_id_fkey';
            columns: ['owner_id', 'security_id'];
            isOneToOne: false;
            referencedRelation: 'equity_securities';
            referencedColumns: ['owner_id', 'id'];
          },
        ];
      };
      equity_sale_lots: {
        Row: {
          event_id: string;
          exercise_deduction: number;
          id: string;
          owner_id: string;
          portfolio_id: string;
          quantity: number;
          sale_id: string;
          tax_deduction: number;
        };
        ComputedFields: never;
        Insert: {
          event_id: string;
          exercise_deduction?: number;
          id?: string;
          owner_id?: string;
          portfolio_id: string;
          quantity: number;
          sale_id: string;
          tax_deduction?: number;
        };
        Update: {
          event_id?: string;
          exercise_deduction?: number;
          id?: string;
          owner_id?: string;
          portfolio_id?: string;
          quantity?: number;
          sale_id?: string;
          tax_deduction?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'equity_sale_lots_owner_id_portfolio_id_event_id_fkey';
            columns: ['owner_id', 'portfolio_id', 'event_id'];
            isOneToOne: false;
            referencedRelation: 'equity_events';
            referencedColumns: ['owner_id', 'portfolio_id', 'id'];
          },
          {
            foreignKeyName: 'equity_sale_lots_owner_id_portfolio_id_event_id_fkey';
            columns: ['owner_id', 'portfolio_id', 'event_id'];
            isOneToOne: false;
            referencedRelation: 'v_equity_lots';
            referencedColumns: ['owner_id', 'portfolio_id', 'id'];
          },
          {
            foreignKeyName: 'equity_sale_lots_owner_id_portfolio_id_sale_id_fkey';
            columns: ['owner_id', 'portfolio_id', 'sale_id'];
            isOneToOne: false;
            referencedRelation: 'equity_sales';
            referencedColumns: ['owner_id', 'portfolio_id', 'id'];
          },
        ];
      };
      equity_sales: {
        Row: {
          bank_inr: number | null;
          bank_on: string | null;
          brokerage: number;
          currency: string;
          fx: number;
          id: string;
          notes: string | null;
          other_fees: number;
          owner_id: string;
          portfolio_id: string;
          price: number;
          security_id: string;
          sold_on: string;
        };
        ComputedFields: never;
        Insert: {
          bank_inr?: number | null;
          bank_on?: string | null;
          brokerage?: number;
          currency: string;
          fx: number;
          id?: string;
          notes?: string | null;
          other_fees?: number;
          owner_id?: string;
          portfolio_id: string;
          price: number;
          security_id: string;
          sold_on: string;
        };
        Update: {
          bank_inr?: number | null;
          bank_on?: string | null;
          brokerage?: number;
          currency?: string;
          fx?: number;
          id?: string;
          notes?: string | null;
          other_fees?: number;
          owner_id?: string;
          portfolio_id?: string;
          price?: number;
          security_id?: string;
          sold_on?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'equity_sales_owner_id_portfolio_id_fkey';
            columns: ['owner_id', 'portfolio_id'];
            isOneToOne: false;
            referencedRelation: 'portfolios';
            referencedColumns: ['owner_id', 'id'];
          },
          {
            foreignKeyName: 'equity_sales_owner_id_security_id_fkey';
            columns: ['owner_id', 'security_id'];
            isOneToOne: false;
            referencedRelation: 'equity_securities';
            referencedColumns: ['owner_id', 'id'];
          },
        ];
      };
      equity_schedule: {
        Row: {
          grant_id: string;
          id: string;
          owner_id: string;
          portfolio_id: string;
          quantity: number;
          scheduled_on: string;
        };
        ComputedFields: never;
        Insert: {
          grant_id: string;
          id?: string;
          owner_id?: string;
          portfolio_id: string;
          quantity: number;
          scheduled_on: string;
        };
        Update: {
          grant_id?: string;
          id?: string;
          owner_id?: string;
          portfolio_id?: string;
          quantity?: number;
          scheduled_on?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'equity_schedule_owner_id_portfolio_id_fkey';
            columns: ['owner_id', 'portfolio_id'];
            isOneToOne: false;
            referencedRelation: 'portfolios';
            referencedColumns: ['owner_id', 'id'];
          },
          {
            foreignKeyName: 'equity_schedule_owner_id_portfolio_id_grant_id_fkey';
            columns: ['owner_id', 'portfolio_id', 'grant_id'];
            isOneToOne: false;
            referencedRelation: 'equity_grants';
            referencedColumns: ['owner_id', 'portfolio_id', 'id'];
          },
        ];
      };
      equity_securities: {
        Row: {
          currency: string;
          id: string;
          market: string;
          name: string;
          owner_id: string;
          private_price: number | null;
          private_price_date: string | null;
          symbol: string | null;
        };
        ComputedFields: never;
        Insert: {
          currency?: string;
          id?: string;
          market?: string;
          name: string;
          owner_id?: string;
          private_price?: number | null;
          private_price_date?: string | null;
          symbol?: string | null;
        };
        Update: {
          currency?: string;
          id?: string;
          market?: string;
          name?: string;
          owner_id?: string;
          private_price?: number | null;
          private_price_date?: string | null;
          symbol?: string | null;
        };
        Relationships: [];
      };
      fixed_deposits: {
        Row: {
          bank: string;
          compounding: string;
          created_at: string;
          id: string;
          maturity_date: string;
          owner_id: string;
          portfolio_id: string;
          principal: number;
          rate: number;
          start_date: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          bank: string;
          compounding?: string;
          created_at?: string;
          id?: string;
          maturity_date: string;
          owner_id?: string;
          portfolio_id: string;
          principal: number;
          rate: number;
          start_date: string;
          updated_at?: string;
        };
        Update: {
          bank?: string;
          compounding?: string;
          created_at?: string;
          id?: string;
          maturity_date?: string;
          owner_id?: string;
          portfolio_id?: string;
          principal?: number;
          rate?: number;
          start_date?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fixed_deposits_portfolio_id_fkey';
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
      mf_transactions: {
        Row: {
          amount: number | null;
          balance: number | null;
          created_at: string;
          description: string;
          folio: string;
          id: string;
          nav: number | null;
          owner_id: string;
          portfolio_id: string;
          scheme_code: string | null;
          scheme_name: string;
          source_key: string;
          transaction_date: string;
          transaction_side: string | null;
          transaction_type: string;
          units: number | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount?: number | null;
          balance?: number | null;
          created_at?: string;
          description: string;
          folio?: string;
          id?: string;
          nav?: number | null;
          owner_id?: string;
          portfolio_id: string;
          scheme_code?: string | null;
          scheme_name: string;
          source_key: string;
          transaction_date: string;
          transaction_side?: never;
          transaction_type: string;
          units?: number | null;
          updated_at?: string;
        };
        Update: {
          amount?: number | null;
          balance?: number | null;
          created_at?: string;
          description?: string;
          folio?: string;
          id?: string;
          nav?: number | null;
          owner_id?: string;
          portfolio_id?: string;
          scheme_code?: string | null;
          scheme_name?: string;
          source_key?: string;
          transaction_date?: string;
          transaction_side?: never;
          transaction_type?: string;
          units?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mf_transactions_portfolio_id_fkey';
            columns: ['portfolio_id'];
            isOneToOne: false;
            referencedRelation: 'portfolios';
            referencedColumns: ['id'];
          },
        ];
      };
      nps_contributions: {
        Row: {
          account: string;
          amount: number;
          contribution_date: string;
          contributor: string;
          created_at: string;
          id: string;
          owner_id: string;
          portfolio_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          account: string;
          amount: number;
          contribution_date: string;
          contributor: string;
          created_at?: string;
          id?: string;
          owner_id?: string;
          portfolio_id: string;
          updated_at?: string;
        };
        Update: {
          account?: string;
          amount?: number;
          contribution_date?: string;
          contributor?: string;
          created_at?: string;
          id?: string;
          owner_id?: string;
          portfolio_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'nps_contributions_portfolio_id_fkey';
            columns: ['portfolio_id'];
            isOneToOne: false;
            referencedRelation: 'portfolios';
            referencedColumns: ['id'];
          },
        ];
      };
      nps_holdings: {
        Row: {
          account: string;
          created_at: string;
          id: string;
          owner_id: string;
          portfolio_id: string;
          scheme_class: string;
          scheme_code: string | null;
          scheme_name: string;
          units: number;
          units_as_of: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          account: string;
          created_at?: string;
          id?: string;
          owner_id?: string;
          portfolio_id: string;
          scheme_class: string;
          scheme_code?: string | null;
          scheme_name: string;
          units?: number;
          units_as_of?: string | null;
          updated_at?: string;
        };
        Update: {
          account?: string;
          created_at?: string;
          id?: string;
          owner_id?: string;
          portfolio_id?: string;
          scheme_class?: string;
          scheme_code?: string | null;
          scheme_name?: string;
          units?: number;
          units_as_of?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'nps_holdings_portfolio_id_fkey';
            columns: ['portfolio_id'];
            isOneToOne: false;
            referencedRelation: 'portfolios';
            referencedColumns: ['id'];
          },
        ];
      };
      nps_nav_latest: {
        Row: {
          is_manual: boolean;
          nav: number;
          nav_date: string;
          prev_nav: number | null;
          prev_nav_date: string | null;
          scheme_code: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          is_manual?: boolean;
          nav: number;
          nav_date: string;
          prev_nav?: number | null;
          prev_nav_date?: string | null;
          scheme_code: string;
          updated_at?: string;
        };
        Update: {
          is_manual?: boolean;
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
          transaction_date: string;
          updated_at: string;
          wage_month: string | null;
          wage_year: number | null;
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
          transaction_date: string;
          updated_at?: string;
          wage_month?: string | null;
          wage_year?: number | null;
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
          transaction_date?: string;
          updated_at?: string;
          wage_month?: string | null;
          wage_year?: number | null;
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
          employee_equity_value: number;
          fd_value: number;
          id: string;
          mf_value: number;
          nps_value: number;
          owner_id: string;
          pf_balance: number;
          portfolio_id: string;
          ppf_balance: number;
          savings: number;
          snap_date: string;
          stocks_value: number;
        };
        ComputedFields: never;
        Insert: {
          card_dues?: number;
          employee_equity_value?: number;
          fd_value?: number;
          id?: string;
          mf_value?: number;
          nps_value?: number;
          owner_id?: string;
          pf_balance?: number;
          portfolio_id: string;
          ppf_balance?: number;
          savings?: number;
          snap_date: string;
          stocks_value?: number;
        };
        Update: {
          card_dues?: number;
          employee_equity_value?: number;
          fd_value?: number;
          id?: string;
          mf_value?: number;
          nps_value?: number;
          owner_id?: string;
          pf_balance?: number;
          portfolio_id?: string;
          ppf_balance?: number;
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
      ppf_entries: {
        Row: {
          account: string;
          amount: number;
          created_at: string;
          entry_date: string;
          entry_type: string;
          id: string;
          owner_id: string;
          portfolio_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          account: string;
          amount: number;
          created_at?: string;
          entry_date: string;
          entry_type: string;
          id?: string;
          owner_id?: string;
          portfolio_id: string;
          updated_at?: string;
        };
        Update: {
          account?: string;
          amount?: number;
          created_at?: string;
          entry_date?: string;
          entry_type?: string;
          id?: string;
          owner_id?: string;
          portfolio_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ppf_entries_portfolio_id_fkey';
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
          market: string;
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
          market: string;
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
          market?: string;
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
      v_equity_lots: {
        Row: {
          acquisition_expenses_inr: number | null;
          allotted_on: string | null;
          basis_per_share_inr: number | null;
          currency: string | null;
          current_fx: number | null;
          current_price: number | null;
          fees: number;
          fmv: number | null;
          fx: number | null;
          grant_id: string;
          grant_kind: string;
          gross_fmv: number | null;
          held_basis_inr: number | null;
          held_units: number | null;
          id: string;
          kind: string;
          occurred_on: string;
          owner_id: string;
          perquisite: number | null;
          portfolio_id: string;
          price_date: string | null;
          purchase_cost_inr: number | null;
          purchase_price: number | null;
          quantity: number;
          schedule_id: string | null;
          security_id: string;
          sold_units: number | null;
          tax_paid_inr: number | null;
          tax_units: number;
          unrealized_inr: number | null;
          unrealized_return: number | null;
          value_inr: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: 'equity_events_owner_id_portfolio_id_fkey';
            columns: ['owner_id', 'portfolio_id'];
            isOneToOne: false;
            referencedRelation: 'portfolios';
            referencedColumns: ['owner_id', 'id'];
          },
          {
            foreignKeyName: 'equity_events_owner_id_portfolio_id_grant_id_fkey';
            columns: ['owner_id', 'portfolio_id', 'grant_id'];
            isOneToOne: false;
            referencedRelation: 'equity_grants';
            referencedColumns: ['owner_id', 'portfolio_id', 'id'];
          },
          {
            foreignKeyName: 'equity_events_owner_id_portfolio_id_grant_id_schedule_id_fkey';
            columns: ['owner_id', 'portfolio_id', 'grant_id', 'schedule_id'];
            isOneToOne: false;
            referencedRelation: 'equity_schedule';
            referencedColumns: ['owner_id', 'portfolio_id', 'grant_id', 'id'];
          },
        ];
      };
      v_equity_portfolio_values: {
        Row: {
          owner_id: string;
          portfolio_id: string;
          value_inr: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: 'equity_events_owner_id_portfolio_id_fkey';
            columns: ['owner_id', 'portfolio_id'];
            isOneToOne: false;
            referencedRelation: 'portfolios';
            referencedColumns: ['owner_id', 'id'];
          },
        ];
      };
      v_equity_sale_details: {
        Row: {
          allotted_on: string | null;
          bank_inr: number | null;
          bank_on: string | null;
          basis_inr: number | null;
          classification: string | null;
          currency: string;
          deductions: number | null;
          effective_fx: number | null;
          event_id: string;
          exercise_deduction: number;
          fx: number;
          grant_id: string;
          gross: number | null;
          holding_days: number | null;
          id: string;
          net: number | null;
          owner_id: string;
          payout: number | null;
          portfolio_id: string;
          quantity: number;
          realized_inr: number | null;
          return_percent: number | null;
          sale_bank_inr: number | null;
          sale_id: string;
          sale_net: number | null;
          sale_payout: number | null;
          security_id: string;
          sold_on: string;
          tax_deduction: number;
          total_quantity: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: 'equity_sale_lots_owner_id_portfolio_id_event_id_fkey';
            columns: ['owner_id', 'portfolio_id', 'event_id'];
            isOneToOne: false;
            referencedRelation: 'equity_events';
            referencedColumns: ['owner_id', 'portfolio_id', 'id'];
          },
          {
            foreignKeyName: 'equity_sale_lots_owner_id_portfolio_id_event_id_fkey';
            columns: ['owner_id', 'portfolio_id', 'event_id'];
            isOneToOne: false;
            referencedRelation: 'v_equity_lots';
            referencedColumns: ['owner_id', 'portfolio_id', 'id'];
          },
          {
            foreignKeyName: 'equity_sale_lots_owner_id_portfolio_id_sale_id_fkey';
            columns: ['owner_id', 'portfolio_id', 'sale_id'];
            isOneToOne: false;
            referencedRelation: 'equity_sales';
            referencedColumns: ['owner_id', 'portfolio_id', 'id'];
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
      delete_equity_sale: { Args: { p_id: string; p_portfolio: string }; Returns: undefined };
      export_equity_ledger: { Args: Record<PropertyKey, never>; Returns: Json };
      lock_equity_portfolio: { Args: { p_owner: string; p_portfolio: string }; Returns: undefined };
      release_job_trigger: { Args: { p_at: string; p_job: string }; Returns: undefined };
      save_equity_sale: {
        Args: {
          p_bank_inr?: number;
          p_bank_on?: string;
          p_brokerage: number;
          p_currency: string;
          p_fx: number;
          p_id: string;
          p_lots: Json;
          p_notes?: string;
          p_other_fees: number;
          p_portfolio: string;
          p_price: number;
          p_security: string;
          p_sold_on: string;
        };
        Returns: undefined;
      };
      upsert_fx_rate: {
        Args: { p_date: string; p_pair: string; p_rate: number };
        Returns: undefined;
      };
      upsert_mf_nav: {
        Args: { p_code: string; p_date: string; p_nav: number };
        Returns: undefined;
      };
      upsert_nps_nav: {
        Args: { p_code: string; p_date: string; p_nav: number };
        Returns: undefined;
      };
      upsert_stock_price: {
        Args: {
          p_close: number;
          p_date: string;
          p_market: string;
          p_source?: string;
          p_symbol: string;
        };
        Returns: undefined;
      };
      validate_equity_grant: {
        Args: { p_grant: string; p_owner: string; p_portfolio: string };
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
