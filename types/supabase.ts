export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string;
          value: Json;
        };
        Insert: {
          key: string;
          value?: Json;
        };
        Update: {
          key?: string;
          value?: Json;
        };
      };
      lotteries: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          location: string | null;
          vehicle_type: 'IVECO' | 'Isuzu' | 'Vitz';
          ticket_price: number;
          total_tickets: number;
          image_url: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          location?: string | null;
          vehicle_type: 'IVECO' | 'Isuzu' | 'Vitz';
          ticket_price?: number;
          total_tickets?: number;
          image_url?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          location?: string | null;
          vehicle_type?: 'IVECO' | 'Isuzu' | 'Vitz';
          ticket_price?: number;
          total_tickets?: number;
          image_url?: string | null;
          is_active?: boolean;
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
        };
      };
      tickets: {
        Row: {
          id: string;
          lottery_id: string | null;
          ticket_number: string;
          user_id: number;
          status: 'available' | 'pending' | 'sold';
          /** Optional offline-buyer contact captured from Admin → Manual Sales (migration 018). */
          buyer_phone: string | null;
          /** Optional offline-buyer note captured from Admin → Manual Sales (migration 018). */
          buyer_note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          lottery_id?: string | null;
          ticket_number: string;
          user_id: number;
          status?: 'available' | 'pending' | 'sold';
          buyer_phone?: string | null;
          buyer_note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          lottery_id?: string | null;
          ticket_number?: string;
          user_id?: number;
          status?: 'available' | 'pending' | 'sold';
          buyer_phone?: string | null;
          buyer_note?: string | null;
          created_at?: string;
        };
      };
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
    };
  };
}
