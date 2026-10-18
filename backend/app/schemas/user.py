from pydantic import BaseModel, Field
from typing import Literal

# Pydantic schemas
class UserCreate(BaseModel):
    full_name: str = Field(alias="fullName", min_length=1)
    organization: str = Field(min_length=1)
    country: str = Field(min_length=1)
    email: str
    firebase_uid: str
    role: Literal["farmer", "restaurant"]

    model_config = {"populate_by_name": True}


class UserResponse(BaseModel):
    id: int
    firebase_uid: str
    email: str
    full_name: str
    organization: str
    country: str
    role: str

    model_config = {
        "from_attributes": True
    }