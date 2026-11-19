import "./LandingPage.css";

const steps = [
  {
    title: "Count your harvest",
    description: "See what’s on hand, what’s available to sell, and what’s already committed to orders.",
    icon: <><path d="M4 10h16v10H4zM3 6h18v4H3zM10 14h4" /></>,
  },
  {
    title: "List it for restaurants",
    description: "Publish what’s available, set a price and pickup window, and let restaurants order through Menurithm.",
    icon: <><path d="M4 20V9l3-5h10l3 5v11H4zM4 10h16m-11 0 1-6m5 6-1-6m-4 16v-5h4v5" /></>,
  },
  {
    title: "Get orders ready",
    description: "Review incoming orders, mark produce ready, and record collection. Restaurants pay you at pickup.",
    icon: <><path d="M8 5H5v16h14V5h-3M8 3h8v4H8zM8 13l3 3 5-5" /></>,
  },
];

const questions = [
  {
    question: "Where do restaurants place orders?",
    answer: "Restaurants browse published farm listings and place pickup orders in Menurithm. Farmers manage their listings and orders in Croprithm.",
  },
  {
    question: "Do I need to approve every pickup order?",
    answer: "No. Restaurants can order in-stock produce at your posted price when you have an upcoming pickup window. The order commits stock when it is placed, not when it is added to a cart.",
  },
  {
    question: "How do I get paid?",
    answer: "Restaurants pay you directly at pickup. You can record payment in Croprithm after collection. Croprithm does not collect online payments.",
  },
];

export default function LandingPage() {
  return (
    <div className="crop-landing">
      <header className="crop-header">
        <div className="crop-shell crop-nav">
          <a className="crop-brand" href="/">
            <img src="/croprithm-icon.svg" alt="" width="34" height="34" />
            Croprithm
          </a>
          <nav aria-label="Main navigation">
            <a className="crop-nav-guide" href="#how-it-works">How it works</a>
            <a className="crop-button crop-button-outline" href="/signin">Sign in</a>
          </nav>
        </div>
      </header>

      <main>
        <section className="crop-shell crop-hero" aria-labelledby="crop-hero-title">
          <div className="crop-hero-copy">
            <p className="crop-eyebrow">The marketplace for growers</p>
            <h1 id="crop-hero-title">Sell your harvest to <em>local kitchens.</em></h1>
            <p className="crop-intro">Track what you have, set your prices and pickup times, and sell to restaurants shopping on Menurithm.</p>
            <div className="crop-actions">
              <a className="crop-button crop-button-primary" href="/signup">Create a farmer account <span aria-hidden="true">→</span></a>
              <a className="crop-text-link" href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a>
              <a className="crop-text-link" href="#product-demo">Watch the 28-second demo</a>
            </div>
            <a className="crop-buyer-shortcut crop-text-link" href="#for-restaurants">Buying for a restaurant? <span aria-hidden="true">↓</span></a>
          </div>
          <figure className="crop-hero-art">
            <img src="/farm-to-kitchen.svg" width="720" height="570" fetchPriority="high"
              alt="Illustration of a crate of fresh vegetables in front of rolling farm fields" />
          </figure>
        </section>

        <section className="crop-shell crop-product-demo" id="product-demo" aria-labelledby="crop-demo-title">
          <p className="crop-eyebrow">Product demo</p>
          <h2 id="crop-demo-title">See Croprithm in action</h2>
          <p>From tracking your harvest to planning deliveries. A 28-second walkthrough with sample data and no audio.</p>
          <video controls controlsList="nodownload" playsInline preload="none" width={1280} height={720}
            poster="/demo/croprithm-walkthrough.jpg" aria-label="Croprithm product walkthrough">
            <source src="/demo/croprithm-walkthrough.mp4" type="video/mp4" />
          </video>
          <details>
            <summary>Read the walkthrough</summary>
            <ol>
              <li>See what is on hand, available to sell, and committed to orders.</li>
              <li>Set a price, unit, and available quantity for a listing on Menurithm.</li>
              <li>Check what to pack, who ordered it, and when it needs to be ready.</li>
              <li>Organize confirmed deliveries and open Google Maps or Apple Maps for directions.</li>
            </ol>
          </details>
        </section>

        <section className="crop-workflow" id="how-it-works" aria-labelledby="crop-workflow-title">
          <div className="crop-shell">
            <p className="crop-eyebrow">How it works</p>
            <h2 id="crop-workflow-title">From harvest to handoff</h2>
            <ol className="crop-steps">
              {steps.map(({ title, description, icon }, index) => (
                <li key={title}>
                  <div className="crop-step-top">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
                    <span aria-hidden="true">0{index + 1}</span>
                  </div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="crop-shell crop-kitchen" id="for-restaurants" aria-labelledby="crop-kitchen-title">
          <div className="crop-kitchen-copy">
            <p className="crop-eyebrow">For restaurants</p>
            <h2 id="crop-kitchen-title">Buying for a restaurant?</h2>
            <p>See what farms have available, check the price per unit, and choose a pickup window in Menurithm. Pay the farmer when you collect your order.</p>
            <a className="crop-button crop-button-outline" href="https://menurithm.com/dashboard/produce-orders">Shop on Menurithm <span aria-hidden="true">↗</span></a>
          </div>
          <figure className="crop-example">
            <figcaption className="crop-eyebrow">Example listing · not live stock</figcaption>
            <div className="crop-example-product">
              <span className="crop-example-art" aria-hidden="true">🍅</span>
              <div>
                <h3>Roma tomatoes</h3>
                <p><strong>$3.00</strong> / lb</p>
              </div>
            </div>
            <dl>
              <div><dt>Available</dt><dd>24 lb</dd></div>
              <div><dt>Pickup</dt><dd>Saturday, 9–11 a.m.</dd></div>
              <div><dt>Payment</dt><dd>Pay at pickup</dd></div>
            </dl>
          </figure>
        </section>

        <section className="crop-faq" aria-labelledby="crop-faq-title">
          <div className="crop-shell crop-faq-inner">
            <h2 id="crop-faq-title">Before your first order</h2>
            <div>
              {questions.map(({ question, answer }) => (
                <details key={question}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="crop-footer">
        <div className="crop-shell">© {new Date().getFullYear()} Croprithm</div>
      </footer>
    </div>
  );
}
