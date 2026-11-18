"""Add the pilot agreement table without altering existing orders."""
from sqlalchemy import inspect, text
from app.db.database import engine
from app.models.user import User
from app.models.produce import ProduceRequest
from app.models.fulfillment import FulfillmentAgreement, PickupCheckout, PickupWindow


if __name__ == "__main__":
    PickupWindow.__table__.create(engine, checkfirst=True)
    PickupCheckout.__table__.create(engine, checkfirst=True)
    FulfillmentAgreement.__table__.create(engine, checkfirst=True)
    columns = {column["name"] for column in inspect(engine).get_columns("fulfillment_agreements")}
    with engine.begin() as connection:
        if "produce_inventory_id" not in columns:
            connection.execute(text(
                "ALTER TABLE fulfillment_agreements ADD COLUMN produce_inventory_id "
                "INTEGER REFERENCES produce_inventory(id)"
            ))
        if "menurithm_inventory_item_id" not in columns:
            connection.execute(text(
                "ALTER TABLE fulfillment_agreements ADD COLUMN menurithm_inventory_item_id INTEGER"
            ))
        for name, definition in {
            "produce_total": "NUMERIC(10, 2)",
            "stock_reserved": "BOOLEAN NOT NULL DEFAULT FALSE",
            "payment_recorded_at": "TIMESTAMP WITH TIME ZONE" if engine.dialect.name == "postgresql" else "DATETIME",
            "pickup_checkout_id": "INTEGER REFERENCES marketplace_pickup_checkouts(id)",
        }.items():
            if name not in columns:
                connection.execute(text(f"ALTER TABLE fulfillment_agreements ADD COLUMN {name} {definition}"))
        connection.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_fulfillment_agreements_pickup_checkout_id "
            "ON fulfillment_agreements (pickup_checkout_id)"
        ))
    print("Fulfillment agreement schema is ready; existing orders are unchanged.")
