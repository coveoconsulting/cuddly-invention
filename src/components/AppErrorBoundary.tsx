import React from "react";

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("app.render_error", { error, errorInfo });
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.18),_transparent_38%),linear-gradient(180deg,#f8fbf7_0%,#eef4ec_100%)] px-4 py-10">
        <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-2xl items-center">
          <div className="w-full rounded-[28px] border border-outline-variant bg-white p-6 shadow-lg sm:p-8">
            <p className="text-xs font-bold uppercase tracking-wider text-secondary">
              Erreur d'affichage
            </p>
            <h1 className="mt-2 text-2xl font-black text-on-surface sm:text-3xl">
              L'application a rencontré une erreur.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-secondary">
              Rechargez la page. Si le problème persiste, le message ci-dessous aidera à
              identifier le composant qui bloque le rendu.
            </p>

            <div className="mt-6 rounded-2xl border border-error/20 bg-error-container p-4">
              <p className="text-sm font-semibold text-error">
                {this.state.error.message || "Erreur inconnue"}
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1b4139]"
              >
                Recharger
              </button>
              <button
                type="button"
                onClick={() => this.setState({ error: null })}
                className="inline-flex items-center justify-center rounded-full border border-outline-variant bg-white px-5 py-3 text-sm font-semibold text-on-surface transition-colors hover:bg-surface"
              >
                Réessayer
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
