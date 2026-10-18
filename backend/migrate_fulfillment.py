"""Add the pilot agreement table without altering existing orders."""
from app.db.database import engine
from app.models.user import User
from app.models.produce import ProduceRequest
from app.models.fulfillment import FulfillmentAgreement


if __name__ == "__main__":
    FulfillmentAgreement.__table__.create(engine, checkfirst=True)
    print("Fulfillment agreement table is ready; existing orders are unchanged.")
