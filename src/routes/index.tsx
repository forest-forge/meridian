import { createFileRoute } from "@tanstack/react-router";
import { MeridianApp } from "@/components/meridian/app";

export const Route = createFileRoute("/")({ component: MeridianApp });
