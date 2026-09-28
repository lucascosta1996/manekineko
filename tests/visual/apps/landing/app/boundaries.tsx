"use client";
import ErrorPage from "../../../../../apps/landing-page/app/error";
import NotFound from "../../../../../apps/landing-page/app/not-found";
export function LandingBoundary({kind}:{kind:string}) { return kind==='error' ? <ErrorPage retry={()=>window.location.reload()} /> : <NotFound />; }
