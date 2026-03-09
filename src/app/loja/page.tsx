"use client";

import {
    Store,
    MapPin,
    Phone,
    FileText,
    Truck,
    Clock,
    Save,
    Upload,
    Package
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default function LojaPage() {
    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-secondary">Informações da Loja</h2>
                    <p className="text-muted-foreground">Configure os dados fundamentais para o funcionamento do seu negócio.</p>
                </div>
                <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 gap-2">
                    <Save className="w-4 h-4" /> Salvar Alterações
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Basic Info */}
                <Card className="md:col-span-2 glass border-none">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Store className="w-5 h-5 text-primary" />
                            <CardTitle className="text-xl">Dados da Unidade</CardTitle>
                        </div>
                        <CardDescription>Informações cadastrais e de contato.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="store-name">Nome da Loja</Label>
                                <Input id="store-name" placeholder="Ex: ConstruMais" className="glass border-none" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="cnpj">CNPJ</Label>
                                <Input id="cnpj" placeholder="00.000.000/0000-00" className="glass border-none" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="address">Endereço Principal</Label>
                            <div className="relative">
                                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input id="address" placeholder="Rua, Número, Bairro, Cidade" className="glass border-none pl-9" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="phone">Telefone / WhatsApp</Label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input id="phone" placeholder="(00) 00000-0000" className="glass border-none pl-9" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="hours">Horário de Funcionamento</Label>
                                <div className="relative">
                                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input id="hours" placeholder="Seg-Sex: 08:00 - 18:00" className="glass border-none pl-9" />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Logo & Visuals */}
                <Card className="glass border-none">
                    <CardHeader>
                        <CardTitle className="text-lg">Logo da Loja</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center justify-center p-6 space-y-4">
                        <div className="w-32 h-32 rounded-2xl bg-slate-100 border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-muted-foreground hover:bg-slate-50 transition-colors cursor-pointer group">
                            <Upload className="w-8 h-8 group-hover:text-primary transition-colors" />
                            <span className="text-xs mt-2">Fazer Upload</span>
                        </div>
                        <p className="text-xs text-center text-muted-foreground">Recomendado: 512x512px (PNG ou SVG)</p>
                    </CardContent>
                </Card>

                {/* Delivery & Logistics */}
                <Card className="glass border-none">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Truck className="w-5 h-5 text-primary" />
                            <CardTitle className="text-xl">Logística</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="delivery-rate">Taxa de Entrega (por km)</Label>
                            <Input id="delivery-rate" placeholder="R$ 5,00" className="glass border-none" />
                        </div>
                        <Separator className="bg-white/20" />
                        <div className="space-y-2">
                            <Label>Produtos Principais</Label>
                            <div className="flex flex-wrap gap-2">
                                {["Cimento", "Tijolo", "Areia", "Pedra", "Argamassa"].map(p => (
                                    <Button key={p} variant="secondary" size="sm" className="bg-slate-100 text-slate-600 border-none hover:bg-primary hover:text-white rounded-lg gap-2">
                                        <Package className="w-3 h-3" /> {p}
                                    </Button>
                                ))}
                            </div>
                            <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 text-xs mt-2 w-full border border-dashed border-primary/20">+ Adicionar Categoria</Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Advanced Config */}
                <Card className="md:col-span-2 glass border-none">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-primary" />
                            <CardTitle className="text-xl">Configurações Fiscais</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="regime">Regime Tributário</Label>
                            <Input id="regime" placeholder="Simples Nacional" className="glass border-none" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="inscricao">Inscrição Estadual</Label>
                            <Input id="inscricao" placeholder="000.000.000.000" className="glass border-none" />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
