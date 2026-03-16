"use client";

import { createContext, useContext, useState, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CartItem {
    product_id: string;
    name: string;
    unit: string;
    price: number;
    quantity: number;
}

interface CartContextValue {
    items: CartItem[];
    addItem: (product: Omit<CartItem, "quantity">) => void;
    removeItem: (product_id: string) => void;
    updateQuantity: (product_id: string, quantity: number) => void;
    clearCart: () => void;
    totalItems: number;
    totalPrice: number;
}

// ── Context ────────────────────────────────────────────────────────────────────

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
    const [items, setItems] = useState<CartItem[]>([]);

    const addItem = useCallback((product: Omit<CartItem, "quantity">) => {
        setItems((prev) => {
            const existing = prev.find((i) => i.product_id === product.product_id);
            if (existing) {
                return prev.map((i) =>
                    i.product_id === product.product_id
                        ? { ...i, quantity: i.quantity + 1 }
                        : i
                );
            }
            return [...prev, { ...product, quantity: 1 }];
        });
    }, []);

    const removeItem = useCallback((product_id: string) => {
        setItems((prev) => prev.filter((i) => i.product_id !== product_id));
    }, []);

    const updateQuantity = useCallback((product_id: string, quantity: number) => {
        if (quantity <= 0) {
            setItems((prev) => prev.filter((i) => i.product_id !== product_id));
            return;
        }
        setItems((prev) =>
            prev.map((i) =>
                i.product_id === product_id ? { ...i, quantity } : i
            )
        );
    }, []);

    const clearCart = useCallback(() => setItems([]), []);

    const totalItems = items.reduce((s, i) => s + i.quantity, 0);
    const totalPrice = items.reduce((s, i) => s + i.quantity * i.price, 0);

    return (
        <CartContext.Provider
            value={{ items, addItem, removeItem, updateQuantity, clearCart, totalItems, totalPrice }}
        >
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const ctx = useContext(CartContext);
    if (!ctx) throw new Error("useCart must be used within CartProvider");
    return ctx;
}
