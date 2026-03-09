"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";

interface KanbanItemProps {
    id: string;
    client: string;
    products: string;
}

export function KanbanItem({ id, client, products }: KanbanItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <Card className="glass border-none shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing">
                <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold text-primary">#{id}</span>
                        <span className="text-sm font-medium">{client}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{products}</p>
                </CardContent>
            </Card>
        </div>
    );
}
