export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: number;
          username: string | null;
          full_name: string | null;
          phone_number: string | null;
          role: 'user' | 'admin';
          created_at: string;
        };
        Insert: {
          id: number;
          username?: string | null;
          full_name?: string | null;
          phone_number?: string | null;
          role?: 'user' | 'admin';
          created_at?: string;
        };
        Update: {
          id?: number;
          username?: string | null;
          full_name?: string | null;
          phone_number?: string | null;
          role?: 'user' | 'admin';
          created_at?: string;
        };
      };
            lotteries: {
        Row: {
          id: string;
          title: string;
          vehicle_type: 'IVECO' | 'Isuzu' | 'Vitz';
          ticket_price: number;
          total_tickets: number;
          image_url: string | null;
          is_active: boolean;
          rank: number | null;
          description: string | null;
          location: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          vehicle_type?: 'IVECO' | 'Isuzu' | 'Vitz';
          ticket_price?: number;
          total_tickets?: number;
          image_url?: string | null;
          is_active?: boolean;
          rank?: number | null;
          description?: string | null;
          location?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          vehicle_type?: 'IVECO' | 'Isuzu' | 'Vitz';
          ticket_price?: number;
          total_tickets?: number;
          image_url?: string | null;
          is_active?: boolean;
          rank?: number | null;
          description?: string | null;
          location?: string | null;
          created_at?: string;
        };
      };

      lottery_items: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          price: number;
          tickets: number;
          location: string | null;
          image_url: string | null;
          rank: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          price?: number;
          tickets?: number;
          location?: string | null;
          image_url?: string | null;
          rank?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          price?: number;
          tickets?: number;
          location?: string | null;
          image_url?: string | null;
          rank?: number;
          is_active?: boolean;
          created_at?: string;
        };
      };

      hero_banners: {
        Row: {
          id: string;
          title: string;
          image_url: string;
          link_url: string | null;
          is_active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          image_url: string;
          link_url?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          image_url?: string;
          link_url?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
      };

      payment_methods: {
        Row: {
          id: string;
          bank_name: string;
          account_name: string;
          account_number: string;
          is_active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          bank_name: string;
          account_name: string;
          account_number: string;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          bank_name?: string;
          account_name?: string;
          account_number?: string;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
      };

      tickets: {
        Row: {
          id: string;
          lottery_id: string | null;
          ticket_number: string;
          user_id: number;
          status: 'available' | 'pending' | 'sold';
          created_at: string;
        };
        Insert: {
          id?: string;
          lottery_id?: string | null;
          ticket_number: string;
          user_id: number;
          status?: 'available' | 'pending' | 'sold';
          created_at?: string;
        };
        Update: {
          id?: string;
          lottery_id?: string | null;
          ticket_number?: string;
          user_id?: number;
          status?: 'available' | 'pending' | 'sold';
          created_at?: string;
        };
      };
      payments: {
        Row: {
          id: string;
          user_id: number;
          ticket_ids: Json;
          amount: number;
          receipt_url: string | null;
          transaction_reference: string | null;
          admin_note: string | null;
          /** Exact reason an admin attached when rejecting the receipt (migration 019). */
          rejection_reason: string | null;
          status: 'pending' | 'approved' | 'rejected';
          created_at: string;
          /** Buyer attribution (migration 024): bot-registered Telegram id + phone. */
          telegram_id: string | null;
          phone_number: string | null;
        };
        Insert: {
          id?: string;
          user_id: number;
          ticket_ids?: Json;
          amount: number;
          receipt_url?: string | null;
          transaction_reference?: string | null;
          admin_note?: string | null;
          /** Exact reason an admin attached when rejecting the receipt (migration 019). */
          rejection_reason?: string | null;
          status?: 'pending' | 'approved' | 'rejected';
          created_at?: string;
          /** Buyer attribution (migration 024): bot-registered Telegram id + phone. */
          telegram_id?: string | null;
          phone_number?: string | null;
        };
        Update: {
          id?: string;
          user_id?: number;
          ticket_ids?: Json;
          amount?: number;
          receipt_url?: string | null;
          transaction_reference?: string | null;
          admin_note?: string | null;
          /** Exact reason an admin attached when rejecting the receipt (migration 019). */
          rejection_reason?: string | null;
          status?: 'pending' | 'approved' | 'rejected';
          created_at?: string;
          /** Buyer attribution (migration 024): bot-registered Telegram id + phone. */
          telegram_id?: string | null;
          phone_number?: string | null;
        };
      };
      profiles: {
        Row: {
          id: string;
          telegram_id: number | null;
          first_name: string | null;
          last_name: string | null;
          username: string | null;
          phone_number: string | null;
          /** Chosen language from the bot's «🌐 ቋንቋ» inline keyboard (migration 032). */
          language_preference: string | null;
          /** Short ISO/legacy code for the chosen language (migration 032). */
          language: string | null;
          /** Personal chat id captured on /start by the bot webhook. */
          chat_id: string | null;
          /** Canonical string-typed Telegram chat id (migration 027). */
          telegram_chat_id: string | null;
          photo_url: string | null;
          /** Last Mini App open — refreshed by POST /api/user/sync (migration 026). */
          last_opened_at: string | null;
          /** True once the user interacted with the bot or opened the Mini App. */
          is_registered: boolean;
          /** True when an admin has blocked this user from accessing the Mini App. */
          is_blocked: boolean;
          /** Wallet balance in ETB — topped up by approvals, spent on tickets. */
          wallet_balance: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          telegram_id?: number | null;
          first_name?: string | null;
          last_name?: string | null;
          username?: string | null;
          phone_number?: string | null;
          language_preference?: string | null;
          language?: string | null;
          chat_id?: string | null;
          telegram_chat_id?: string | null;
          photo_url?: string | null;
          last_opened_at?: string | null;
          is_registered?: boolean;
          is_blocked?: boolean;
          wallet_balance?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          telegram_id?: number | null;
          first_name?: string | null;
          last_name?: string | null;
          username?: string | null;
          phone_number?: string | null;
          language_preference?: string | null;
          language?: string | null;
          chat_id?: string | null;
          telegram_chat_id?: string | null;
          photo_url?: string | null;
          last_opened_at?: string | null;
          is_registered?: boolean;
          is_blocked?: boolean;
          wallet_balance?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      telegram_users: {
        Row: {
          id: string;
          telegram_id: number | null;
          chat_id: string | null;
          telegram_chat_id: string | null;
          first_name: string | null;
          last_name: string | null;
          username: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          telegram_id?: number | null;
          chat_id?: string | null;
          telegram_chat_id?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          username?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          telegram_id?: number | null;
          chat_id?: string | null;
          telegram_chat_id?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          username?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      app_settings: {
        Row: {
          id: number;
          app_title: string | null;
          logo_url: string | null;
          banner_url: string | null;
          ticket_price: number | null;
          total_tickets: number | null;
          support: Json | null;
          telegram_bot_token: string | null;
          telegram_chat_id: string | null;
          updated_at: string | null;
        };
        Insert: {
          id: number;
          app_title?: string | null;
          logo_url?: string | null;
          banner_url?: string | null;
          ticket_price?: number | null;
          total_tickets?: number | null;
          support?: Json | null;
          telegram_bot_token?: string | null;
          telegram_chat_id?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: number;
          app_title?: string | null;
          logo_url?: string | null;
          banner_url?: string | null;
          ticket_price?: number | null;
          total_tickets?: number | null;
          support?: Json | null;
          telegram_bot_token?: string | null;
          telegram_chat_id?: string | null;
          updated_at?: string | null;
        };
      };

      telegram_scheduler: {
        Row: {
          id: string;
          caption: string;
          image_url: string | null;
          interval_hours: number;
          interval_minutes: number;
          is_active: boolean;
          bot_token: string;
          chat_id: string;
          last_posted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          caption?: string;
          image_url?: string | null;
          interval_hours?: number;
          interval_minutes?: number;
          is_active?: boolean;
          bot_token?: string;
          chat_id?: string;
          last_posted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          caption?: string;
          image_url?: string | null;
          interval_hours?: number;
          interval_minutes?: number;
          is_active?: boolean;
          bot_token?: string;
          chat_id?: string;
          last_posted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
};

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
