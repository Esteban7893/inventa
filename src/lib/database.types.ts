export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      clientes: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nombre: string
          owner_id: string
          telefono: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          nombre: string
          owner_id?: string
          telefono?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nombre?: string
          owner_id?: string
          telefono?: string | null
        }
        Relationships: []
      }
      pedido_lineas: {
        Row: {
          cantidad: number
          created_at: string
          id: string
          owner_id: string
          pedido_id: string
          precio_unit_cents: number
          producto_id: string
        }
        Insert: {
          cantidad: number
          created_at?: string
          id?: string
          owner_id?: string
          pedido_id: string
          precio_unit_cents: number
          producto_id: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          id?: string
          owner_id?: string
          pedido_id?: string
          precio_unit_cents?: number
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_lineas_pedido_id_owner_id_fkey"
            columns: ["pedido_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "pedido_lineas_producto_id_owner_id_fkey"
            columns: ["producto_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      pedidos: {
        Row: {
          cancelado_at: string | null
          cliente_id: string
          created_at: string
          enviado_at: string | null
          estado: string
          id: string
          idempotency_key: string | null
          owner_id: string
          total_cents: number
        }
        Insert: {
          cancelado_at?: string | null
          cliente_id: string
          created_at?: string
          enviado_at?: string | null
          estado?: string
          id?: string
          idempotency_key?: string | null
          owner_id?: string
          total_cents: number
        }
        Update: {
          cancelado_at?: string | null
          cliente_id?: string
          created_at?: string
          enviado_at?: string | null
          estado?: string
          id?: string
          idempotency_key?: string | null
          owner_id?: string
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_owner_id_fkey"
            columns: ["cliente_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      productos: {
        Row: {
          created_at: string
          id: string
          nombre: string
          owner_id: string
          precio_cents: number
          sku: string | null
          stock: number
          stock_minimo: number
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
          owner_id?: string
          precio_cents: number
          sku?: string | null
          stock?: number
          stock_minimo?: number
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
          owner_id?: string
          precio_cents?: number
          sku?: string | null
          stock?: number
          stock_minimo?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancelar_pedido: { Args: { p_pedido_id: string }; Returns: undefined }
      crear_pedido: {
        Args: {
          p_cliente_id: string
          p_idempotency_key?: string
          p_lineas: Json
        }
        Returns: string
      }
      enviar_pedido: { Args: { p_pedido_id: string }; Returns: undefined }
      panel_resumen: {
        Args: { p_ahora?: string }
        Returns: {
          cancelados_mes: number
          cancelados_mes_anterior: number
          ingresos_mes_anterior_cents: number
          ingresos_mes_cents: number
          mes_actual: string
          mes_anterior: string
          pedidos_mes: number
          pedidos_mes_anterior: number
          pendientes: number
          productos: number
          productos_bajo_minimo: number
          unidades: number
        }[]
      }
      pedidos_pagina: {
        Args: {
          p_antes_created_at?: string
          p_antes_id?: string
          p_estado?: string
          p_limite?: number
        }
        Returns: {
          cliente_nombre: string
          created_at: string
          estado: string
          id: string
          lineas: number
          total_cents: number
          unidades: number
        }[]
      }
      productos_bajo_minimo: {
        Args: { p_limite?: number }
        Returns: {
          created_at: string
          id: string
          nombre: string
          owner_id: string
          precio_cents: number
          sku: string | null
          stock: number
          stock_minimo: number
        }[]
        SetofOptions: {
          from: "*"
          to: "productos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
